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


async def _migrate_schema(conn) -> None:
    """Apply one-shot schema patches to upgraded databases.

    SQLAlchemy's `create_all` only adds new things; it never alters or removes
    existing columns. So when the model changes, we patch existing DBs here.
    All statements are idempotent and run before `create_all`.
    """
    table_exists = await conn.scalar(text("SELECT to_regclass('api_keys') IS NOT NULL"))
    if not table_exists:
        return

    # v0.4.0: stopped hashing API keys (`key_hash`/`prefix` columns → single
    # plaintext `key` column). The full key isn't recoverable from the hash,
    # so the cleanest migration is to drop and recreate — all existing keys
    # become invalid and the user creates new ones.
    has_old_schema = await conn.scalar(
        text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'api_keys' AND column_name = 'key_hash'"
        )
    )
    if has_old_schema:
        await conn.execute(text("DROP TABLE api_keys"))
        return

    # v0.3.1: dropped `revoked` column from ApiKey model.
    await conn.execute(text("ALTER TABLE api_keys DROP COLUMN IF EXISTS revoked"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await _migrate_schema(conn)
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
