from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import generate_api_key
from ..db import get_db
from ..deps import get_current_admin
from ..models import Admin, ApiKey
from ..schemas import ApiKeyCreate, ApiKeyCreated, ApiKeyOut

router = APIRouter(prefix="/api-keys", tags=["api-keys"])


@router.get("", response_model=list[ApiKeyOut])
async def list_keys(
    _: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> list[ApiKey]:
    rows = (
        await db.execute(select(ApiKey).order_by(ApiKey.created_at.desc()))
    ).scalars().all()
    return list(rows)


@router.post("", response_model=ApiKeyCreated, status_code=status.HTTP_201_CREATED)
async def create_key(
    body: ApiKeyCreate,
    _: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> ApiKey:
    row = ApiKey(name=body.name, key=generate_api_key())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_key(
    key_id: int,
    _: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    row = await db.get(ApiKey, key_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await db.delete(row)
    await db.commit()
