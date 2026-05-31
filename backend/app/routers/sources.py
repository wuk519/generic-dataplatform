from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import Principal, get_current_admin, get_principal
from ..models import Admin, Event, Source
from ..schemas import SourceOut

router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("", response_model=list[SourceOut])
async def list_sources(
    _: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> list[Source]:
    rows = (
        await db.execute(select(Source).order_by(Source.last_seen.desc()))
    ).scalars().all()
    return list(rows)


@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source(
    source_id: str,
    _: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a source and every event under it.

    Destructive and irreversible, so this is admin-JWT only (an API key
    cannot delete data). Events are removed explicitly rather than relying
    on the DB-level cascade, so it works regardless of how the FK was created.
    """
    src = await db.get(Source, source_id)
    if not src:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Source not found")
    await db.execute(delete(Event).where(Event.source_id == source_id))
    await db.delete(src)
    await db.commit()
