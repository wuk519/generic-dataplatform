from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    id: int
    username: str
    role: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    role: str
    is_active: bool
    created_at: datetime


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    role: str = Field(default="user", pattern="^(admin|user)$")


class UserUpdate(BaseModel):
    role: str | None = Field(default=None, pattern="^(admin|user)$")
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=6, max_length=128)


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)


class ApiKeyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    key: str
    owner_id: int | None = None
    owner: str | None = None
    created_at: datetime
    last_used_at: datetime | None


# Kept for backwards compatibility — same shape as ApiKeyOut now that the full
# key is always returned.
ApiKeyCreated = ApiKeyOut


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
    description: str | None = None
    owner_id: int | None = None
    owner: str | None = None
    first_seen: datetime
    last_seen: datetime
    event_count: int


class SourceUpdate(BaseModel):
    description: str | None = Field(default=None, max_length=2000)


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


class NumericStats(BaseModel):
    count: int
    min: float
    max: float
    mean: float
    stddev: float
    sum: float


class FieldStat(BaseModel):
    name: str
    type: str  # number | boolean | string | object | mixed
    present: int  # non-null occurrences in the sample
    numeric: NumericStats | None = None


class FieldsResponse(BaseModel):
    sampled_events: int
    fields: list[FieldStat]


class SeriesResponse(BaseModel):
    x: str | None
    fields: list[str]
    points: list[dict[str, Any]]
