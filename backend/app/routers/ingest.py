import csv
import io
import json
import re
from datetime import datetime, timezone
from pathlib import PurePosixPath

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import Principal, get_principal
from ..ingest_core import BATCH_SIZE, insert_batch, normalize_record
from ..models import ApiKey
from ..schemas import IngestRecord, IngestResponse

router = APIRouter(prefix="/ingest", tags=["ingest"])


# Integers without leading zeros (so phone-number-ish strings stay strings).
_INT_RE = re.compile(r"^-?(?:0|[1-9]\d*)$")

# Sentinel for "omit this CSV cell".
_DROP = object()


def _touch_api_key(principal: Principal) -> None:
    if isinstance(principal, ApiKey):
        principal.last_used_at = datetime.now(timezone.utc)


def _infer_format(filename: str | None, peek: bytes) -> str | None:
    """Infer the upload format from filename extension first, then content."""
    if filename:
        ext = PurePosixPath(filename).suffix.lower()
        if ext == ".csv":
            return "csv"
        if ext in (".ndjson", ".jsonl"):
            return "ndjson"
        if ext == ".json":
            return "json"

    head = peek.lstrip()
    if head.startswith(b"["):
        return "json"
    if head.startswith(b"{"):
        return "ndjson"
    first_line = head.split(b"\n", 1)[0]
    if b"," in first_line:
        return "csv"
    return None


def _csv_cell(raw: str | None) -> object:
    """Parse a CSV cell into a typed value, or _DROP to omit from payload."""
    if raw is None or raw == "":
        return _DROP
    s = raw.strip()
    if not s:
        return _DROP
    lower = s.lower()
    if lower == "true":
        return True
    if lower == "false":
        return False
    if lower in ("null", "none"):
        return None
    if _INT_RE.match(s):
        return int(s)
    if "." in s or "e" in lower:
        try:
            return float(s)
        except ValueError:
            pass
    return s


@router.post("", response_model=IngestResponse)
async def ingest(
    body: list[IngestRecord] | IngestRecord,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> IngestResponse:
    items = body if isinstance(body, list) else [body]
    try:
        rows = [normalize_record(r.model_dump()) for r in items]
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from e

    for i in range(0, len(rows), BATCH_SIZE):
        await insert_batch(db, rows[i : i + BATCH_SIZE])

    _touch_api_key(principal)
    await db.commit()
    return IngestResponse(accepted=len(rows))


@router.post("/upload", response_model=IngestResponse)
async def upload(
    file: UploadFile = File(...),
    source_id: str | None = Form(None),
    format: str | None = Form(None),
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> IngestResponse:
    data = await file.read()

    requested = (format or "").strip().lower()
    if requested in ("", "auto"):
        fmt = _infer_format(file.filename, data[:4096])
        if not fmt:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Could not infer file format. Use a .csv/.ndjson/.json extension "
                "or pass format=csv|ndjson|json.",
            )
    else:
        fmt = requested

    accepted = 0
    batch: list[dict] = []

    async def flush() -> None:
        nonlocal accepted, batch
        if batch:
            await insert_batch(db, batch)
            await db.commit()
            accepted += len(batch)
            batch = []

    def add(obj: dict) -> None:
        batch.append(normalize_record(obj, source_id))

    try:
        if fmt == "ndjson":
            for raw_line in data.splitlines():
                line = raw_line.strip()
                if not line:
                    continue
                add(json.loads(line))
                if len(batch) >= BATCH_SIZE:
                    await flush()
            await flush()

        elif fmt == "json":
            arr = json.loads(data)
            if not isinstance(arr, list):
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST, "JSON body must be an array"
                )
            for obj in arr:
                add(obj)
                if len(batch) >= BATCH_SIZE:
                    await flush()
            await flush()

        elif fmt == "csv":
            text = data.decode("utf-8-sig")
            reader = csv.DictReader(io.StringIO(text))
            for row in reader:
                parsed: dict = {}
                for k, raw in row.items():
                    if k is None:
                        continue
                    val = _csv_cell(raw)
                    if val is _DROP:
                        continue
                    parsed[k] = val
                add(parsed)
                if len(batch) >= BATCH_SIZE:
                    await flush()
            await flush()

        else:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"Unknown format: {fmt}"
            )

    except json.JSONDecodeError as e:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Invalid JSON (format={fmt}): {e}"
        ) from e
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from e

    _touch_api_key(principal)
    await db.commit()
    return IngestResponse(accepted=accepted, format=fmt)
