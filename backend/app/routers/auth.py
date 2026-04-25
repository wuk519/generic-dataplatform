from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import create_access_token, verify_password
from ..db import get_db
from ..deps import get_current_admin
from ..models import Admin
from ..schemas import LoginRequest, LoginResponse, MeResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)) -> LoginResponse:
    admin = (
        await db.execute(select(Admin).where(Admin.username == body.username))
    ).scalar_one_or_none()
    if not admin or not verify_password(body.password, admin.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    return LoginResponse(access_token=create_access_token(admin.username))


@router.get("/me", response_model=MeResponse)
async def me(admin: Admin = Depends(get_current_admin)) -> MeResponse:
    return MeResponse(username=admin.username)
