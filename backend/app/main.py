from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from . import __version__
from .auth import hash_password
from .config import settings
from .db import Base, SessionLocal, engine
from .models import Admin
from .routers import api_keys, auth, events, ingest, sources


async def _bootstrap_admin() -> None:
    if not (settings.admin_username and settings.admin_password):
        return
    async with SessionLocal() as db:
        existing = (
            await db.execute(
                select(Admin).where(Admin.username == settings.admin_username)
            )
        ).scalar_one_or_none()
        if existing:
            return
        db.add(
            Admin(
                username=settings.admin_username,
                password_hash=hash_password(settings.admin_password),
            )
        )
        await db.commit()
        print(f"[bootstrap] Created admin user '{settings.admin_username}'")


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _bootstrap_admin()
    yield
    await engine.dispose()


app = FastAPI(
    title="Generic Data Platform",
    version=__version__,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(api_keys.router)
app.include_router(ingest.router)
app.include_router(sources.router)
app.include_router(events.router)


@app.get("/health")
async def health() -> dict:
    return {"ok": True}


@app.get("/version")
async def version() -> dict:
    return {"version": __version__}
