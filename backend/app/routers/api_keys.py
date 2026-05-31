from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import generate_api_key
from ..db import get_db
from ..deps import get_current_user
from ..models import ApiKey, User
from ..schemas import ApiKeyCreate, ApiKeyCreated, ApiKeyOut

router = APIRouter(prefix="/api-keys", tags=["api-keys"])


def _to_out(key: ApiKey, owner_name: str | None) -> ApiKeyOut:
    return ApiKeyOut(
        id=key.id,
        name=key.name,
        key=key.key,
        owner_id=key.owner_id,
        owner=owner_name,
        created_at=key.created_at,
        last_used_at=key.last_used_at,
    )


@router.get("", response_model=list[ApiKeyOut])
async def list_keys(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ApiKeyOut]:
    stmt = select(ApiKey, User.username).join(
        User, ApiKey.owner_id == User.id, isouter=True
    )
    if user.role != "admin":
        stmt = stmt.where(ApiKey.owner_id == user.id)
    stmt = stmt.order_by(ApiKey.created_at.desc())
    rows = (await db.execute(stmt)).all()
    return [_to_out(key, owner) for key, owner in rows]


@router.post("", response_model=ApiKeyCreated, status_code=status.HTTP_201_CREATED)
async def create_key(
    body: ApiKeyCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ApiKeyOut:
    row = ApiKey(name=body.name, key=generate_api_key(), owner_id=user.id)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _to_out(row, user.username)


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_key(
    key_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    row = await db.get(ApiKey, key_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if user.role != "admin" and row.owner_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your API key")
    await db.delete(row)
    await db.commit()
