from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import get_current_admin
from ..models import Admin, Source
from ..schemas import SourceOut

router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("", response_model=list[SourceOut])
async def list_sources(
    _: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> list[Source]:
    rows = (
        await db.execute(select(Source).order_by(Source.last_seen.desc()))
    ).scalars().all()
    return list(rows)
