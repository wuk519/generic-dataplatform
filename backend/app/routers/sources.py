from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import Principal, get_principal
from ..models import Source
from ..schemas import SourceOut

router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("", response_model=list[SourceOut])
async def list_sources(
    _: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> list[Source]:
    rows = (
        await db.execute(select(Source).order_by(Source.last_seen.desc()))
    ).scalars().all()
    return list(rows)
