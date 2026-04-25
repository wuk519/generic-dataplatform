import csv
import io
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import Principal, get_principal
from ..ingest_core import BATCH_SIZE, insert_batch, normalize_record
from ..models import ApiKey
from ..schemas import IngestRecord, IngestResponse

router = APIRouter(prefix="/ingest", tags=["ingest"])


def _touch_api_key(principal: Principal) -> None:
    if isinstance(principal, ApiKey):
        principal.last_used_at = datetime.now(timezone.utc)


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
    format: str = Form("ndjson"),
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> IngestResponse:
    fmt = format.lower()
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
            buffer = b""
            while chunk := await file.read(64 * 1024):
                buffer += chunk
                while b"\n" in buffer:
                    line, buffer = buffer.split(b"\n", 1)
                    line = line.strip()
                    if not line:
                        continue
                    add(json.loads(line))
                    if len(batch) >= BATCH_SIZE:
                        await flush()
            tail = buffer.strip()
            if tail:
                add(json.loads(tail))
            await flush()

        elif fmt == "json":
            data = await file.read()
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
            data = (await file.read()).decode("utf-8-sig")
            reader = csv.DictReader(io.StringIO(data))
            for row in reader:
                cleaned = {k: v for k, v in row.items() if v not in (None, "")}
                add(cleaned)
                if len(batch) >= BATCH_SIZE:
                    await flush()
            await flush()

        else:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"Unknown format: {format}"
            )

    except json.JSONDecodeError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid JSON: {e}") from e
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from e

    _touch_api_key(principal)
    await db.commit()
    return IngestResponse(accepted=accepted)
