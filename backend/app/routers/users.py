from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import hash_password
from ..db import get_db
from ..deps import require_admin
from ..models import ApiKey, Event, Source, User
from ..schemas import UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


async def _active_admin_count(db: AsyncSession) -> int:
    return (
        await db.execute(
            select(func.count())
            .select_from(User)
            .where(User.role == "admin", User.is_active.is_(True))
        )
    ).scalar_one()


@router.get("", response_model=list[UserOut])
async def list_users(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[User]:
    rows = (
        await db.execute(select(User).order_by(User.created_at.desc()))
    ).scalars().all()
    return list(rows)


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> User:
    existing = (
        await db.execute(select(User).where(User.username == body.username))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Username already taken")
    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        role=body.role,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    body: UserUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> User:
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    # Guard against locking out the last admin (demotion or deactivation).
    demoting = body.role is not None and body.role != "admin" and user.role == "admin"
    deactivating = body.is_active is False and user.is_active and user.role == "admin"
    if (demoting or deactivating) and await _active_admin_count(db) <= 1:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Cannot remove the last active admin"
        )
    if deactivating and user.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot disable yourself")

    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.password:
        user.password_hash = hash_password(body.password)
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot delete yourself")
    if user.role == "admin" and await _active_admin_count(db) <= 1:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Cannot delete the last active admin"
        )
    # Explicitly remove the user's data (the FK cascade may not exist on DBs
    # upgraded from a single-admin schema, where owner_id was added by ALTER).
    owned = (
        await db.execute(select(Source.source_id).where(Source.owner_id == user.id))
    ).scalars().all()
    if owned:
        await db.execute(delete(Event).where(Event.source_id.in_(owned)))
        await db.execute(delete(Source).where(Source.owner_id == user.id))
    await db.execute(delete(ApiKey).where(ApiKey.owner_id == user.id))
    await db.delete(user)
    await db.commit()
