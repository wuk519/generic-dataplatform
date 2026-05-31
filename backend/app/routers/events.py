import base64
import json
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import Principal, assert_source_access, get_principal
from ..models import Event
from ..schemas import EventsPage, StatPoint

router = APIRouter(tags=["events"])


def _encode_cursor(timestamp: datetime, event_id: int) -> str:
    raw = json.dumps({"t": timestamp.isoformat(), "i": event_id}).encode()
    return base64.urlsafe_b64encode(raw).decode()


def _decode_cursor(cursor: str) -> tuple[datetime, int]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode())
        d = json.loads(raw)
        return datetime.fromisoformat(d["t"]), int(d["i"])
    except Exception as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid cursor") from e


@router.get("/sources/{source_id}/events", response_model=EventsPage)
async def list_events(
    source_id: str,
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    cursor: str | None = None,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> EventsPage:
    await assert_source_access(db, source_id, principal)
    stmt = select(Event).where(Event.source_id == source_id)
    if from_:
        stmt = stmt.where(Event.timestamp >= from_)
    if to:
        stmt = stmt.where(Event.timestamp <= to)
    if cursor:
        ct, ci = _decode_cursor(cursor)
        # Keyset on (timestamp DESC, id DESC).
        stmt = stmt.where(
            (Event.timestamp < ct) | ((Event.timestamp == ct) & (Event.id < ci))
        )
    stmt = stmt.order_by(Event.timestamp.desc(), Event.id.desc()).limit(limit + 1)

    rows = (await db.execute(stmt)).scalars().all()
    next_cursor: str | None = None
    if len(rows) > limit:
        rows = list(rows[:limit])
        last = rows[-1]
        next_cursor = _encode_cursor(last.timestamp, last.id)

    return EventsPage(items=list(rows), next_cursor=next_cursor)


Bucket = Literal["minute", "hour", "day"]


@router.get("/sources/{source_id}/stats", response_model=list[StatPoint])
async def stats(
    source_id: str,
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = Query(None),
    bucket: Bucket = Query("hour"),
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> list[StatPoint]:
    await assert_source_access(db, source_id, principal)
    bucket_col = func.date_trunc(bucket, Event.timestamp).label("ts")
    stmt = (
        select(bucket_col, func.count().label("count"))
        .where(Event.source_id == source_id)
        .group_by(bucket_col)
        .order_by(bucket_col)
    )
    if from_:
        stmt = stmt.where(Event.timestamp >= from_)
    if to:
        stmt = stmt.where(Event.timestamp <= to)
    rows = (await db.execute(stmt)).all()
    return [StatPoint(ts=r.ts, count=r.count) for r in rows]
