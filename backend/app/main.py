from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text

from . import __version__
from .auth import hash_password
from .config import settings
from .db import Base, SessionLocal, engine
from .models import User
from .routers import analysis, api_keys, auth, events, ingest, sources, users


async def _bootstrap_admin() -> None:
    if not (settings.admin_username and settings.admin_password):
        return
    async with SessionLocal() as db:
        existing = (
            await db.execute(
                select(User).where(User.username == settings.admin_username)
            )
        ).scalar_one_or_none()
        if existing:
            return
        db.add(
            User(
                username=settings.admin_username,
                password_hash=hash_password(settings.admin_password),
                role="admin",
                is_active=True,
            )
        )
        await db.commit()
        print(f"[bootstrap] Created admin user '{settings.admin_username}'")


async def _migrate_pre_create(conn) -> None:
    """Schema patches on existing tables that `create_all` won't perform.

    Runs before create_all. All statements are idempotent.
    """
    if await conn.scalar(text("SELECT to_regclass('users') IS NOT NULL")):
        # v0.9.0: profile fields.
        await conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(120)")
        )
        await conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255)")
        )
        await conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT")
        )

    if await conn.scalar(text("SELECT to_regclass('sources') IS NOT NULL")):
        # v0.7.0: user-provided description. v0.8.0: ownership.
        await conn.execute(
            text("ALTER TABLE sources ADD COLUMN IF NOT EXISTS description TEXT")
        )
        await conn.execute(
            text("ALTER TABLE sources ADD COLUMN IF NOT EXISTS owner_id INTEGER")
        )

    if await conn.scalar(text("SELECT to_regclass('api_keys') IS NOT NULL")):
        # v0.4.0: stopped hashing API keys; drop+recreate the old hashed schema.
        has_old_schema = await conn.scalar(
            text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = 'api_keys' AND column_name = 'key_hash'"
            )
        )
        if has_old_schema:
            await conn.execute(text("DROP TABLE api_keys"))
        else:
            # v0.3.1: dropped `revoked`. v0.8.0: ownership.
            await conn.execute(
                text("ALTER TABLE api_keys DROP COLUMN IF EXISTS revoked")
            )
            await conn.execute(
                text("ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS owner_id INTEGER")
            )


async def _migrate_post_create(conn) -> None:
    """Data migrations that need the new `users` table to already exist.

    v0.8.0 introduced multi-user accounts. Migrate the old single-admin table
    into `users`, then assign all previously-unowned sources and API keys to
    that admin so existing data stays visible.
    """
    # Migrate legacy `admin` rows into `users` (as admins), then drop it.
    if await conn.scalar(text("SELECT to_regclass('admin') IS NOT NULL")):
        await conn.execute(
            text(
                "INSERT INTO users (username, password_hash, role, is_active) "
                "SELECT username, password_hash, 'admin', true FROM admin "
                "ON CONFLICT (username) DO NOTHING"
            )
        )
        await conn.execute(text("DROP TABLE admin"))

    # Backfill ownership of pre-multi-user data to the earliest admin, if any.
    admin_id = await conn.scalar(
        text("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")
    )
    if admin_id is not None:
        await conn.execute(
            text("UPDATE sources SET owner_id = :a WHERE owner_id IS NULL"),
            {"a": admin_id},
        )
        await conn.execute(
            text("UPDATE api_keys SET owner_id = :a WHERE owner_id IS NULL"),
            {"a": admin_id},
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await _migrate_pre_create(conn)
        await conn.run_sync(Base.metadata.create_all)
        await _migrate_post_create(conn)
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
app.include_router(users.router)
app.include_router(api_keys.router)
app.include_router(ingest.router)
app.include_router(sources.router)
app.include_router(events.router)
app.include_router(analysis.router)


@app.get("/health")
async def health() -> dict:
    return {"ok": True}


@app.get("/version")
async def version() -> dict:
    return {"version": __version__}
