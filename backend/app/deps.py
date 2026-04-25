from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import decode_token, hash_api_key
from .db import get_db
from .models import Admin, ApiKey

Principal = Admin | ApiKey


async def _resolve_admin(authorization: str, db: AsyncSession) -> Admin:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid authorization header")
    token = authorization.split(" ", 1)[1]
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    admin = (
        await db.execute(select(Admin).where(Admin.username == sub))
    ).scalar_one_or_none()
    if not admin:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Admin not found")
    return admin


async def _resolve_api_key(x_api_key: str, db: AsyncSession) -> ApiKey:
    key_hash = hash_api_key(x_api_key)
    api_key = (
        await db.execute(
            select(ApiKey).where(ApiKey.key_hash == key_hash, ApiKey.revoked.is_(False))
        )
    ).scalar_one_or_none()
    if not api_key:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid API key")
    return api_key


async def get_current_admin(
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> Admin:
    if not authorization:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    return await _resolve_admin(authorization, db)


async def get_principal(
    authorization: str | None = Header(None),
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    db: AsyncSession = Depends(get_db),
) -> Principal:
    if x_api_key:
        return await _resolve_api_key(x_api_key, db)
    if authorization:
        return await _resolve_admin(authorization, db)
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing credentials")
