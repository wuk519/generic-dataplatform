import base64

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import create_access_token, hash_password, verify_password
from ..db import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas import (
    LoginRequest,
    LoginResponse,
    MeResponse,
    PasswordChange,
    ProfileUpdate,
    RegisterRequest,
)

router = APIRouter(prefix="/auth", tags=["auth"])

# Cap avatar uploads so we don't bloat the DB / every /auth/me response.
MAX_AVATAR_BYTES = 512 * 1024


@router.post("/register", response_model=LoginResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)) -> LoginResponse:
    existing = (
        await db.execute(select(User).where(User.username == body.username))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Username already taken")
    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        role="user",
        is_active=True,
    )
    db.add(user)
    await db.commit()
    return LoginResponse(access_token=create_access_token(user.username))


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)) -> LoginResponse:
    user = (
        await db.execute(select(User).where(User.username == body.username))
    ).scalar_one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is disabled")
    return LoginResponse(access_token=create_access_token(user.username))


@router.get("/me", response_model=MeResponse)
async def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("/me", response_model=MeResponse)
async def update_profile(
    body: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    user.display_name = (body.display_name or "").strip() or None
    user.email = (body.email or "").strip() or None
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: PasswordChange,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Current password is incorrect"
        )
    user.password_hash = hash_password(body.new_password)
    await db.commit()


@router.post("/me/avatar", response_model=MeResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    content_type = file.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File must be an image")
    data = await file.read()
    if len(data) > MAX_AVATAR_BYTES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Image too large (max {MAX_AVATAR_BYTES // 1024} KB)",
        )
    b64 = base64.b64encode(data).decode()
    user.avatar = f"data:{content_type};base64,{b64}"
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/me/avatar", response_model=MeResponse)
async def delete_avatar(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    user.avatar = None
    await db.commit()
    await db.refresh(user)
    return user
