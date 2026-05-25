from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    username: str


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)


class ApiKeyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    prefix: str
    created_at: datetime
    last_used_at: datetime | None
    revoked: bool


class ApiKeyCreated(ApiKeyOut):
    key: str  # full key, shown once


class IngestRecord(BaseModel):
    model_config = ConfigDict(extra="allow")

    source_id: str | None = Field(default=None, max_length=255)
    timestamp: datetime | None = None


class IngestResponse(BaseModel):
    accepted: int
    # Populated by /ingest/upload to report which format was used (auto-detected
    # or explicit). Always null for /ingest.
    format: str | None = None


class SourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    source_id: str
    first_seen: datetime
    last_seen: datetime
    event_count: int


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_id: str
    timestamp: datetime
    payload: dict[str, Any]
    ingested_at: datetime


class EventsPage(BaseModel):
    items: list[EventOut]
    next_cursor: str | None


class StatPoint(BaseModel):
    ts: datetime
    count: int
