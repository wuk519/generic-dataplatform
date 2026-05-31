"""Bootstrap or reset the admin user.

Usage: python -m scripts.create_admin <username> <password>
"""
import asyncio
import sys

from sqlalchemy import select

from app.auth import hash_password
from app.db import Base, SessionLocal, engine
from app.models import User


async def main(username: str, password: str) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as db:
        existing = (
            await db.execute(select(User).where(User.username == username))
        ).scalar_one_or_none()
        if existing:
            existing.password_hash = hash_password(password)
            existing.role = "admin"
            existing.is_active = True
            print(f"Updated admin '{username}'")
        else:
            db.add(
                User(
                    username=username,
                    password_hash=hash_password(password),
                    role="admin",
                    is_active=True,
                )
            )
            print(f"Created admin '{username}'")
        await db.commit()


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python -m scripts.create_admin <username> <password>")
        sys.exit(1)
    asyncio.run(main(sys.argv[1], sys.argv[2]))
