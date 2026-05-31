from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import (
    Principal,
    acting_user_id,
    get_principal,
    is_admin_principal,
    scope_user_id,
)
from ..models import Event, Source, User
from ..schemas import SourceOut, SourceUpdate

router = APIRouter(prefix="/sources", tags=["sources"])


def _to_out(src: Source, owner_name: str | None) -> SourceOut:
    return SourceOut(
        source_id=src.source_id,
        description=src.description,
        owner_id=src.owner_id,
        owner=owner_name,
        first_seen=src.first_seen,
        last_seen=src.last_seen,
        event_count=src.event_count,
    )


@router.get("", response_model=list[SourceOut])
async def list_sources(
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> list[SourceOut]:
    stmt = select(Source, User.username).join(
        User, Source.owner_id == User.id, isouter=True
    )
    scope = scope_user_id(principal)
    if scope is not None:
        stmt = stmt.where(Source.owner_id == scope)
    stmt = stmt.order_by(Source.last_seen.desc())
    rows = (await db.execute(stmt)).all()
    return [_to_out(src, owner) for src, owner in rows]


@router.patch("/{source_id}", response_model=SourceOut)
async def update_source(
    source_id: str,
    body: SourceUpdate,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> SourceOut:
    src = await db.get(Source, source_id)
    if not src:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Source not found")
    if not is_admin_principal(principal) and src.owner_id != acting_user_id(principal):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Source not found")
    src.description = body.description
    await db.commit()
    await db.refresh(src)
    owner = await db.get(User, src.owner_id) if src.owner_id else None
    return _to_out(src, owner.username if owner else None)


@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source(
    source_id: str,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a source and every event under it.

    Allowed for the source's owner or any admin.
    """
    src = await db.get(Source, source_id)
    if not src:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Source not found")
    if not is_admin_principal(principal) and src.owner_id != acting_user_id(principal):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Source not found")
    await db.execute(delete(Event).where(Event.source_id == source_id))
    await db.delete(src)
    await db.commit()
