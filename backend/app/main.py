from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text

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


async def _apply_schema_patches(conn) -> None:
    """Drop columns that were removed from the model.

    SQLAlchemy's `create_all` adds tables/columns but never alters or removes
    existing ones, so when we drop a column from a model it persists in any
    pre-existing database. Each statement is idempotent (`IF EXISTS`).
    """
    await conn.execute(text("ALTER TABLE api_keys DROP COLUMN IF EXISTS revoked"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _apply_schema_patches(conn)
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
