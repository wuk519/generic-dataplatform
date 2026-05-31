import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Event, Source

BATCH_SIZE = 1000

# Integers without leading zeros (so e.g. zip codes / phone numbers stay strings).
_INT_RE = re.compile(r"^-?(?:0|[1-9]\d*)$")

# Sentinel for "drop this cell from the payload".
DROP = object()


def infer_scalar(raw: Any) -> Any:
    """Coerce a raw cell value (from CSV/TSV/Excel) into a typed JSON value.

    Returns the sentinel `DROP` for empty cells so callers can omit the key.
    Non-string inputs (already-typed Excel cells) are passed through unchanged
    except for empty strings / None.
    """
    if raw is None:
        return DROP
    if not isinstance(raw, str):
        # Excel hands us real ints/floats/bools/datetimes already.
        if isinstance(raw, datetime):
            return raw.isoformat()
        return raw
    s = raw.strip()
    if not s:
        return DROP
    lower = s.lower()
    if lower == "true":
        return True
    if lower == "false":
        return False
    if lower in ("null", "none"):
        return None
    if _INT_RE.match(s):
        try:
            return int(s)
        except ValueError:
            pass
    if "." in s or "e" in lower:
        try:
            return float(s)
        except ValueError:
            pass
    return s


def normalize_record(record: dict[str, Any], default_source_id: str | None = None) -> dict:
    src = record.get("source_id") or default_source_id
    if not src:
        raise ValueError("source_id is required")

    ts_value = record.get("timestamp")
    if ts_value is None:
        ts = datetime.now(timezone.utc)
    elif isinstance(ts_value, datetime):
        ts = ts_value if ts_value.tzinfo else ts_value.replace(tzinfo=timezone.utc)
    elif isinstance(ts_value, str):
        try:
            ts = datetime.fromisoformat(ts_value.replace("Z", "+00:00"))
        except ValueError as e:
            raise ValueError(f"Invalid timestamp '{ts_value}': {e}") from e
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
    elif isinstance(ts_value, (int, float)):
        ts = datetime.fromtimestamp(ts_value, tz=timezone.utc)
    else:
        raise ValueError(f"Unsupported timestamp type: {type(ts_value).__name__}")

    payload = {k: v for k, v in record.items() if k not in ("source_id", "timestamp")}
    return {"source_id": str(src), "timestamp": ts, "payload": payload}


async def insert_batch(db: AsyncSession, rows: list[dict]) -> None:
    """Insert a batch of normalized event rows and upsert their source aggregates."""
    if not rows:
        return

    by_src: dict[str, tuple[datetime, datetime, int]] = {}
    for r in rows:
        s = r["source_id"]
        t = r["timestamp"]
        if s in by_src:
            mn, mx, c = by_src[s]
            by_src[s] = (min(mn, t), max(mx, t), c + 1)
        else:
            by_src[s] = (t, t, 1)

    # Upsert sources first so the FK on events succeeds for new sources.
    for src, (mn, mx, c) in by_src.items():
        stmt = pg_insert(Source).values(
            source_id=src, first_seen=mn, last_seen=mx, event_count=c
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["source_id"],
            set_={
                "last_seen": func.greatest(Source.last_seen, stmt.excluded.last_seen),
                "first_seen": func.least(Source.first_seen, stmt.excluded.first_seen),
                "event_count": Source.event_count + stmt.excluded.event_count,
            },
        )
        await db.execute(stmt)

    await db.execute(Event.__table__.insert(), rows)
