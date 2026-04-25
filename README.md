# Generic Data Platform

A simple, Splunk-like data platform: ingest events grouped by `source_id`, query them via API or browse them in the UI.

## Architecture

- **Backend**: FastAPI + SQLAlchemy 2.0 (async) + PostgreSQL (JSONB), packaged as `dataplatform-backend`
- **Frontend**: React + Vite + TypeScript + Tailwind + TanStack Query
- **Storage**: Postgres with `(source_id, timestamp)` btree index. Payloads stored as JSONB.
- **Auth**: admin JWT for the UI; SHA-256-hashed API keys for programmatic ingest.

## Layout

```
backend/
  app/
    main.py            # FastAPI app + lifespan (auto create_all)
    config.py          # pydantic-settings, reads .env
    db.py              # async engine + Base + get_db
    models.py          # Admin, ApiKey, Source, Event
    schemas.py         # Pydantic v2 request/response models
    auth.py            # bcrypt passwords, JWT, API-key gen + sha256 hash
    deps.py            # get_current_admin, get_principal (JWT or API key)
    ingest_core.py     # normalize_record + insert_batch (with source upsert)
    routers/
      auth.py          # POST /auth/login, GET /auth/me
      api_keys.py      # CRUD on /api-keys (admin-only)
      ingest.py        # POST /ingest, POST /ingest/upload
      sources.py       # GET /sources
      events.py        # GET /sources/{id}/events, /stats
  scripts/
    create_admin.py    # bootstrap admin user
  pyproject.toml       # package metadata + deps (single source of version)
  .env.example
frontend/
  src/{App.tsx, main.tsx, index.css}
  src/api/client.ts    # typed fetch wrapper
  src/lib/auth.ts      # JWT in localStorage
  src/components/Layout.tsx
  src/pages/{Login,Sources,SourceDetail,Upload,ApiKeys}.tsx
  package.json, vite.config.ts, tailwind.config.ts, tsconfig.json
docker-compose.yml     # postgres only
install.sh             # one-shot setup for macOS / Ubuntu
install.ps1            # one-shot setup for Windows (PowerShell)
```

## Quickstart (local dev)

### Prerequisites

- **Python 3.11+** — <https://www.python.org/downloads/>
- **Node.js 18+** — <https://nodejs.org/>
- **Docker** (for Postgres) — <https://www.docker.com/products/docker-desktop/>

### 1. Run the install script

One script sets up **both backend and frontend**.

**macOS / Ubuntu:**
```bash
./install.sh
```

**Windows (PowerShell):**
```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

What the script does, in order:

| Step | Action | Side |
|---|---|---|
| 1 | Verify Python 3.11+ on PATH (tries `python3.13` → `python3.12` → `python3.11` → `python3` → `python` / `py`) | prereq |
| 2 | Verify Node.js 18+ and `npm` | prereq |
| 3 | Verify Docker (warn-only — needed for Postgres, not for install itself) | prereq |
| 4 | Create `backend/.venv` if missing, upgrade `pip`, run `pip install -e .` | **Backend** |
| 5 | Copy `backend/.env.example` → `backend/.env` if missing | **Backend** |
| 6 | `cd frontend && npm install` | **Frontend** |
| 7 | Print the next-step commands | — |

**Idempotent** — re-running reuses the existing venv and `node_modules`; only stale deps are reinstalled. Safe to run after pulling new changes.

**What it deliberately does *not* do** (kept as separate manual steps because they are stateful or run services):

- `docker compose up -d` — starts Postgres
- `python -m scripts.create_admin admin changeme` — bootstraps the admin user
- `uvicorn app.main:app --reload` — runs the API
- `npm run dev` — runs the UI

These are printed at the end of the install script as copy-paste-ready commands and listed in steps 2–4 below.

### 2. Start Postgres

```bash
docker compose up -d
```

### 3. Bootstrap admin + run backend

**macOS / Ubuntu:**
```bash
cd backend
source .venv/bin/activate
python -m scripts.create_admin admin changeme
uvicorn app.main:app --reload
```

**Windows:**
```powershell
cd backend
.venv\Scripts\Activate.ps1
python -m scripts.create_admin admin changeme
uvicorn app.main:app --reload
```

API at <http://localhost:8000>. OpenAPI docs at <http://localhost:8000/docs>.

### 4. Run frontend

```bash
cd frontend
npm run dev
```

UI at <http://localhost:5173>. Sign in with the admin you just created.

## Concepts

- **Sources** auto-register on first ingest. The `sources` row tracks `first_seen`, `last_seen`, and `event_count`.
- **Events** are `{ source_id, timestamp, payload }`. `payload` is anything that's valid JSON.
- **API keys** authenticate programmatic ingest. Create them in the UI's *API Keys* page; the full key is shown **once**.
- **Admin JWT** authenticates the UI (24-hour expiry).
- Both `/ingest` and `/ingest/upload` accept either an `Authorization: Bearer <jwt>` header or `X-API-Key: <key>`.

## Ingest examples

```bash
# Single record
curl -X POST http://localhost:8000/ingest \
  -H "X-API-Key: dpk_..." \
  -H "Content-Type: application/json" \
  -d '{"source_id":"web-prod","level":"INFO","msg":"hello"}'

# Batch
curl -X POST http://localhost:8000/ingest \
  -H "X-API-Key: dpk_..." \
  -H "Content-Type: application/json" \
  -d '[{"source_id":"web-prod","msg":"a"},{"source_id":"web-prod","msg":"b"}]'

# File upload (NDJSON)
curl -X POST http://localhost:8000/ingest/upload \
  -H "X-API-Key: dpk_..." \
  -F "source_id=web-prod" \
  -F "format=ndjson" \
  -F "file=@events.ndjson"
```

Records may include their own `timestamp` (ISO 8601 string, epoch seconds, or epoch ms-as-float). If absent, the server stamps `now()` in UTC.

## Query examples

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme"}' | jq -r .access_token)

curl http://localhost:8000/sources \
  -H "Authorization: Bearer $TOKEN"

curl "http://localhost:8000/sources/web-prod/events?limit=10" \
  -H "Authorization: Bearer $TOKEN"

curl "http://localhost:8000/sources/web-prod/stats?bucket=hour" \
  -H "Authorization: Bearer $TOKEN"
```

Pagination uses an opaque `cursor` (keyset on `(timestamp, id) DESC`). Pass `?cursor=...` from the previous response's `next_cursor`.

## Schema

```
admin       (id, username, password_hash, created_at)
api_keys    (id, name, prefix, key_hash unique, created_at, last_used_at, revoked)
sources     (source_id PK, first_seen, last_seen, event_count)
events      (id BIGSERIAL, source_id FK, timestamp, payload JSONB, ingested_at)
            INDEX (source_id, timestamp)
```

## Scaling notes

- The `(source_id, timestamp)` btree handles all source-filtered, time-bounded queries.
- API keys are looked up by indexed SHA-256 hash — verification is O(1) and fast enough for high-throughput ingest. (bcrypt would be a per-request bottleneck.)
- File uploads stream and commit in 1000-record batches; API batch ingest chunks the same way.
- Pagination is keyset, never OFFSET.
- For ad-hoc filtering inside JSON payloads (e.g. `payload->>'level' = 'ERROR'`), add a GIN index on `events.payload`. Skipped by default to keep ingest fast.
- For very large datasets, consider time-based partitioning of `events` by month.

## Versioning

Single source of truth: [`backend/app/__init__.py`](backend/app/__init__.py) (`__version__`).

- `backend/pyproject.toml` reads it via Hatch's dynamic version (`[tool.hatch.version] path = "app/__init__.py"`), so `pip install -e .` and any built wheel pick up the same string.
- The FastAPI app passes it to `FastAPI(version=...)`, so it shows up in `/openapi.json` and `/docs`.
- A `GET /version` endpoint returns `{"version": "..."}` for runtime checks.
- Frontend version lives in [`frontend/package.json`](frontend/package.json); keep it in sync manually for now.

To cut a new version, bump `__version__` in `backend/app/__init__.py` (and `frontend/package.json` if you want them aligned), then commit + tag.

## What's intentionally not here (yet)

- Cross-source search / full-text search.
- Alerting, retention policies.
- Multi-user / RBAC.
- Migrations (we use `Base.metadata.create_all` on startup; add Alembic before any schema change).
