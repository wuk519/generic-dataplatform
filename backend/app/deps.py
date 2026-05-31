from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import decode_token
from .db import get_db
from .models import ApiKey, Source, User

# A request actor is either a logged-in user (JWT) or an API key.
Principal = User | ApiKey


async def _resolve_user(authorization: str, db: AsyncSession) -> User:
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
    user = (
        await db.execute(select(User).where(User.username == sub))
    ).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not found or disabled")
    return user


async def _resolve_api_key(x_api_key: str, db: AsyncSession) -> ApiKey:
    api_key = (
        await db.execute(select(ApiKey).where(ApiKey.key == x_api_key))
    ).scalar_one_or_none()
    if not api_key:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid API key")
    # A key is only valid while its owner exists and is active.
    owner = await db.get(User, api_key.owner_id) if api_key.owner_id else None
    if not owner or not owner.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "API key owner is disabled")
    return api_key


async def get_current_user(
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not authorization:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    return await _resolve_user(authorization, db)


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user


async def get_principal(
    authorization: str | None = Header(None),
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    db: AsyncSession = Depends(get_db),
) -> Principal:
    if x_api_key:
        return await _resolve_api_key(x_api_key, db)
    if authorization:
        return await _resolve_user(authorization, db)
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing credentials")


# --- scoping helpers ------------------------------------------------------
def is_admin_principal(p: Principal) -> bool:
    return isinstance(p, User) and p.role == "admin"


def acting_user_id(p: Principal) -> int | None:
    """The user id that owns data created by this principal."""
    return p.id if isinstance(p, User) else p.owner_id


def scope_user_id(p: Principal) -> int | None:
    """User id to filter reads by, or None for admins (who see everything)."""
    return None if is_admin_principal(p) else acting_user_id(p)


async def assert_source_access(
    db: AsyncSession, source_id: str, principal: Principal
) -> Source:
    """Load a source, 404ing if it doesn't exist or the principal can't see it.

    Returns 404 (not 403) on an unauthorized source so we don't reveal that a
    source with that id exists under another owner.
    """
    src = await db.get(Source, source_id)
    if not src:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Source not found")
    if not is_admin_principal(principal) and src.owner_id != acting_user_id(principal):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Source not found")
    return src
