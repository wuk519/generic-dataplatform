"""Field profiling and chart-data endpoints for analysis.

Both compute on demand from stored events (no ingest-time changes), so they
work on data that already exists. Profiling runs over a capped sample of the
most recent events to stay fast at scale.
"""
import math
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import Principal, get_principal
from ..models import Event
from ..schemas import FieldsResponse, FieldStat, NumericStats, SeriesResponse

router = APIRouter(tags=["analysis"])

# Cap how many recent events we scan when profiling fields.
PROFILE_SAMPLE = 20_000
# Cap how many points a single series request returns.
SERIES_MAX = 20_000


def _is_number(v: object) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


@router.get("/sources/{source_id}/fields", response_model=FieldsResponse)
async def profile_fields(
    source_id: str,
    _: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> FieldsResponse:
    """Profile the top-level payload fields of a source's recent events."""
    stmt = (
        select(Event.payload)
        .where(Event.source_id == source_id)
        .order_by(Event.timestamp.desc(), Event.id.desc())
        .limit(PROFILE_SAMPLE)
    )
    payloads = (await db.execute(stmt)).scalars().all()

    # Per-field accumulators.
    present: dict[str, int] = {}
    type_tags: dict[str, set[str]] = {}
    num_count: dict[str, int] = {}
    num_min: dict[str, float] = {}
    num_max: dict[str, float] = {}
    num_sum: dict[str, float] = {}
    num_sumsq: dict[str, float] = {}

    for payload in payloads:
        if not isinstance(payload, dict):
            continue
        for key, value in payload.items():
            if value is None:
                continue
            present[key] = present.get(key, 0) + 1
            tags = type_tags.setdefault(key, set())
            if _is_number(value):
                tags.add("number")
                v = float(value)
                num_count[key] = num_count.get(key, 0) + 1
                num_min[key] = v if key not in num_min else min(num_min[key], v)
                num_max[key] = v if key not in num_max else max(num_max[key], v)
                num_sum[key] = num_sum.get(key, 0.0) + v
                num_sumsq[key] = num_sumsq.get(key, 0.0) + v * v
            elif isinstance(value, bool):
                tags.add("boolean")
            elif isinstance(value, str):
                tags.add("string")
            else:
                tags.add("object")

    fields: list[FieldStat] = []
    for key in sorted(present):
        tags = type_tags[key]
        if len(tags) == 1:
            ftype = next(iter(tags))
        else:
            ftype = "mixed"

        numeric = None
        if "number" in tags and num_count.get(key):
            n = num_count[key]
            mean = num_sum[key] / n
            var = max(num_sumsq[key] / n - mean * mean, 0.0)
            numeric = NumericStats(
                count=n,
                min=num_min[key],
                max=num_max[key],
                mean=mean,
                stddev=math.sqrt(var),
                sum=num_sum[key],
            )

        fields.append(
            FieldStat(name=key, type=ftype, present=present[key], numeric=numeric)
        )

    return FieldsResponse(sampled_events=len(payloads), fields=fields)


@router.get("/sources/{source_id}/series", response_model=SeriesResponse)
async def series(
    source_id: str,
    fields: str = Query(..., description="Comma-separated payload field names"),
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = Query(None),
    limit: int = Query(2000, ge=1, le=SERIES_MAX),
    _: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> SeriesResponse:
    """Return selected payload fields per event, time-ordered, for charting."""
    names = [f.strip() for f in fields.split(",") if f.strip()]
    if not names:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No fields requested")

    stmt = select(Event.timestamp, Event.payload).where(Event.source_id == source_id)
    if from_:
        stmt = stmt.where(Event.timestamp >= from_)
    if to:
        stmt = stmt.where(Event.timestamp <= to)
    # Most-recent `limit`, then re-sort ascending so charts read left-to-right.
    stmt = stmt.order_by(Event.timestamp.desc(), Event.id.desc()).limit(limit)

    rows = (await db.execute(stmt)).all()
    points: list[dict] = []
    for ts, payload in reversed(rows):
        point: dict = {"ts": ts.isoformat()}
        if isinstance(payload, dict):
            for name in names:
                if name in payload:
                    point[name] = payload[name]
        points.append(point)

    return SeriesResponse(x=None, fields=names, points=points)
