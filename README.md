# Generic Data Platform

A simple, Splunk-like data platform. Push events grouped by `source_id` over HTTP or via file upload; browse and query them through a web UI or REST API.

- **Backend** — FastAPI + SQLAlchemy 2.0 async + PostgreSQL (JSONB), packaged as `dataplatform-backend`
- **Frontend** — React + Vite + TypeScript + Tailwind + TanStack Query
- **Auth** — admin JWT for the UI; plaintext-stored API keys for programmatic ingest (visible in the UI)
- **Index** — `events(source_id, timestamp)` btree → fast source + time-range queries even at millions of rows

---

## Step 1 — Install prerequisites

Install these on your machine first:

| What | Why | Where |
|---|---|---|
| **Python 3.11+** | runs the backend | <https://www.python.org/downloads/> |
| **Node.js 18+** | runs the frontend dev server | <https://nodejs.org/> |
| **Docker Desktop** | runs Postgres in a container | <https://www.docker.com/products/docker-desktop/> |

After installing, open a **fresh** terminal and confirm everything is on your `PATH`:

```bash
python --version    # 3.11.x or newer
node -v             # v18 or newer
docker --version    # any recent version
```

> **Windows tip:** when installing Python, check the box **"Add Python to PATH"** on the first screen of the installer.
> **Ubuntu tip:** if `python3 --version` is older than 3.11, install a newer one with `sudo apt install python3.12 python3.12-venv`.

---

## Step 2 — Get the code

Pick whichever you prefer:

**Option A — Clone with git** (best for staying up to date):
```bash
git clone https://github.com/wuk519/generic-dataplatform.git
cd generic-dataplatform
```

**Option B — Use a zip snapshot** (best for one-off install on a machine without git):

1. On a machine with git, build the zip:
   ```bash
   python package.py
   ```
   This produces `dist/dataplatform-<version>.zip` (e.g. `dist/dataplatform-0.1.0.zip`) containing only the files tracked by git — no `.venv`, no `node_modules`, no `.env`.
2. Copy that zip to the target machine.
3. Extract it:
   - **Windows**: right-click → *Extract All* (creates a single `dataplatform-<version>` folder).
   - **macOS/Linux**: `unzip -d dataplatform-<version> dataplatform-<version>.zip` (the files sit at the zip root, so extract into a named folder to keep things tidy).
4. `cd` into the extracted folder and continue with Step 3.

---

## Step 3 — Run the install script (one-time)

This creates the backend Python virtual environment, installs all backend + frontend dependencies, and copies `backend/.env` from the template. It's idempotent — safe to re-run after pulling new commits.

**macOS / Ubuntu:**
```bash
./install.sh
```

**Windows (PowerShell):**
```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

What it actually does, in order:

1. Verifies Python 3.11+ is on `PATH`
2. Verifies Node 18+ and `npm`
3. Checks for Docker (warns if missing, doesn't fail)
4. Creates `backend/.venv`, upgrades `pip`, runs `pip install -e .` (installs the backend as an editable package with all dependencies)
5. Copies `backend/.env.example` → `backend/.env` if missing
6. Runs `npm install` in `frontend/`

When it finishes, you'll see *Setup complete* and the next-step command.

---

## Step 4 — Start everything

A single command starts Postgres, the backend, and the frontend together. It also auto-creates the admin user on first run (using `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `backend/.env`).

```bash
python dev.py
```

What this does:

1. `docker compose up -d` — starts Postgres in a container, port `5432`
2. Waits up to 60s for Postgres to accept connections (`pg_isready`)
3. Launches `uvicorn` (backend) on port `8000`
4. Launches `npm run dev` (frontend) on port `5173`
5. The FastAPI lifespan auto-creates the admin user the first time it runs

You'll see something like:

```
==> Starting Postgres (docker compose up -d)
==> Waiting for Postgres to accept connections
[OK] Postgres is ready
==> Starting backend (uvicorn) on http://localhost:8000
==> Starting frontend (vite) on http://localhost:5173

[OK] Everything is up.
    Open    http://localhost:5173
    API docs  http://localhost:8000/docs
    Stop      Ctrl-C
```

Open <http://localhost:5173>. Sign in:

- **Username**: `admin`
- **Password**: `changeme`

(These are the defaults in `backend/.env`. Change them — see [Customizing](#customizing) below.)

---

## Step 5 — Try it

Once signed in:

1. Go to **API Keys** → *Create key* (name it e.g. `dev`). The full key is visible on the list page — click **Show** to reveal, **Copy** to copy.
2. Push some test data from another terminal:

   ```bash
   curl -X POST http://localhost:8000/ingest \
     -H "X-API-Key: dpk_..." \
     -H "Content-Type: application/json" \
     -d '[
       {"source_id":"web-prod","level":"INFO","msg":"hello"},
       {"source_id":"web-prod","level":"ERROR","msg":"boom"}
     ]'
   ```

3. Go back to the UI → **Sources** → click `web-prod`. You'll see your two events.
4. Or upload a file: **Upload** page → pick NDJSON / JSON / CSV → submit.

---

## Step 6 — Stop

In the terminal where `python dev.py` is running, press **Ctrl-C**. The backend and frontend shut down cleanly.

**Postgres keeps running** in Docker. To stop it too:

```bash
docker compose down
```

To stop Postgres **and wipe all data** (clean slate for next run):

```bash
docker compose down -v
```

---

## Daily workflow

After the one-time install:

```bash
cd generic-dataplatform
python dev.py
# ... work ...
# Ctrl-C to stop
```

That's it. No venv to activate, no separate terminals, no `create_admin` step.

---

## Customizing

### Change admin credentials

Edit `backend/.env`:

```
ADMIN_USERNAME=youralias
ADMIN_PASSWORD=a-strong-password
```

If the admin user already exists, the bootstrap is a **no-op** (it won't overwrite). To change an existing user's password:

```bash
cd backend
.venv/bin/python -m scripts.create_admin admin new-password    # Windows: .venv\Scripts\python.exe -m scripts.create_admin admin new-password
```

### Change ports, secret, CORS

`backend/.env` controls:

- `DATABASE_URL` — Postgres connection string
- `SECRET_KEY` — used to sign JWTs (set a long random string in any non-toy use)
- `JWT_EXPIRES_MINUTES` — default 1440 (24h)
- `CORS_ORIGINS` — JSON array of allowed origins for the API

The frontend dev server's port is in `frontend/vite.config.ts` (default 5173) and the proxy target there points at the backend (default 8000).

---

## What you can do with the API

### Ingest

All ingest and read endpoints accept **either** an admin `Authorization: Bearer <jwt>` header **or** an `X-API-Key: <key>` header. Admin-only endpoints require JWT: `/auth/*`, `/api-keys`, and `DELETE /sources/{id}` (deleting a source and its events is destructive, so an API key can't do it).

```bash
# Single record
curl -X POST http://localhost:8000/ingest \
  -H "X-API-Key: dpk_..." \
  -H "Content-Type: application/json" \
  -d '{"source_id":"web-prod","level":"INFO","msg":"hello"}'

# Batch (array)
curl -X POST http://localhost:8000/ingest \
  -H "X-API-Key: dpk_..." \
  -H "Content-Type: application/json" \
  -d '[{"source_id":"web-prod","msg":"a"},{"source_id":"web-prod","msg":"b"}]'

# File upload — format is auto-detected from the file extension:
#   .csv  .tsv/.tab  .ndjson/.jsonl  .json  .xlsx/.xlsm  (optionally .gz)
# For CSV/TSV/Excel, cell values are auto-typed (numbers, booleans, null).
# Gzipped files are decompressed on the fly. Pass -F "format=..." to override.
curl -X POST http://localhost:8000/ingest/upload \
  -H "X-API-Key: dpk_..." \
  -F "source_id=web-prod" \
  -F "file=@events.csv"

# Excel and gzipped files work the same way
curl -X POST http://localhost:8000/ingest/upload \
  -H "X-API-Key: dpk_..." \
  -F "source_id=sensors" \
  -F "file=@readings.xlsx"
```

The upload response reports which format was used:
```json
{"accepted": 100, "format": "csv"}
```

Records may carry their own `timestamp` (ISO 8601 string, epoch seconds, or epoch ms-as-float). If absent, the server stamps `now()` in UTC. `source_id` is required (the upload endpoint accepts a default to apply to records that lack one).

### Query

You can use the same API key for reads:

```bash
# List sources
curl http://localhost:8000/sources \
  -H "X-API-Key: dpk_..."

# Events for a source (keyset-paginated)
curl "http://localhost:8000/sources/web-prod/events?limit=10" \
  -H "X-API-Key: dpk_..."

# Time-bucketed counts (for charts)
curl "http://localhost:8000/sources/web-prod/stats?bucket=hour" \
  -H "X-API-Key: dpk_..."
```

#### Analysis

Two endpoints power the source **Analysis** tab — field profiling and chart data:

```bash
# Profile the top-level payload fields (type + numeric stats) over a sample
# of the most recent events. Numeric fields include count/min/max/mean/stddev.
curl "http://localhost:8000/sources/sensors/fields" \
  -H "X-API-Key: dpk_..."

# Pull selected fields per event, time-ordered, for plotting one against another
curl "http://localhost:8000/sources/sensors/series?fields=x,y&limit=2000" \
  -H "X-API-Key: dpk_..."
```

In the UI, open a source → **Analysis** to see the field-metrics table and an
interactive chart where you pick any numeric field for the Y axis and either
time or another numeric field for the X axis.

Or use the admin JWT — get one with:

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme"}' | jq -r .access_token)

curl http://localhost:8000/sources -H "Authorization: Bearer $TOKEN"
```

Pass `?cursor=...` from the previous response's `next_cursor` to keep paging.

Full interactive docs: <http://localhost:8000/docs>.

---

## Project layout

```
backend/
  app/
    __init__.py        # __version__ lives here
    main.py            # FastAPI app + lifespan (create_all + admin bootstrap)
    config.py          # pydantic-settings, reads .env
    db.py              # async engine + Base + get_db
    models.py          # Admin, ApiKey, Source, Event
    schemas.py         # Pydantic v2 request/response models
    auth.py            # bcrypt passwords, JWT, API-key generation
    deps.py            # get_current_admin, get_principal (JWT or API key)
    ingest_core.py     # normalize_record, insert_batch, scalar type-inference
    routers/
      auth.py          # POST /auth/login, GET /auth/me
      api_keys.py      # CRUD on /api-keys (admin-only)
      ingest.py        # POST /ingest, POST /ingest/upload (csv/tsv/json/ndjson/xlsx/gz)
      sources.py       # GET /sources, DELETE /sources/{id}
      events.py        # GET /sources/{id}/events, /stats
      analysis.py      # GET /sources/{id}/fields, /series
  scripts/
    create_admin.py    # manual admin create / password reset
  pyproject.toml       # package metadata + deps (single source of version)
  .env.example
frontend/
  src/
    App.tsx, main.tsx, index.css
    api/client.ts      # typed fetch wrapper
    lib/{auth.ts, format.ts}
    components/         # Layout, icons, ui, BarChart, ScatterChart, AnalysisPanel
    pages/             # Login, Sources, SourceDetail, Upload, ApiKeys
  package.json, vite.config.ts, tailwind.config.ts, tsconfig.json
docker-compose.yml     # postgres only
install.sh             # one-shot setup (macOS / Ubuntu)
install.ps1            # one-shot setup (Windows PowerShell)
dev.py                 # cross-platform runner (Postgres + backend + frontend)
```

---

## Schema

```
admin       (id, username, password_hash, created_at)
api_keys    (id, name, key UNIQUE, created_at, last_used_at)
sources     (source_id PK, first_seen, last_seen, event_count)
events      (id BIGSERIAL, source_id FK, timestamp, payload JSONB, ingested_at)
            INDEX (source_id, timestamp)
```

Tables are created automatically on first backend startup via `Base.metadata.create_all` — no manual migration step.

---

## Scaling notes

- The `(source_id, timestamp)` btree handles all source-filtered, time-bounded queries.
- API keys are stored as plaintext and looked up via a unique btree index — O(1), fast enough for high-throughput ingest. The full key is visible in the UI; this trades against DB-leak resistance and is appropriate for local / single-admin use only.
- File uploads stream and commit in 1000-record batches; the batch ingest endpoint chunks the same way.
- Pagination is keyset, never `OFFSET`.
- For ad-hoc filtering inside JSON payloads (e.g. `payload->>'level' = 'ERROR'`), add a GIN index on `events.payload`. Skipped by default to keep ingest fast.
- For very large datasets, consider time-based partitioning of `events` by month.

---

## Versioning

Single source of truth: `__version__` in [backend/app/\_\_init\_\_.py](backend/app/__init__.py).

- `backend/pyproject.toml` reads it via Hatch's dynamic version, so `pip install -e .` and any built wheel pick up the same string.
- The FastAPI app passes it to `FastAPI(version=...)`, so it shows up in `/openapi.json` and `/docs`.
- `GET /version` returns `{"version": "..."}` for runtime checks.
- Frontend version lives in [frontend/package.json](frontend/package.json); keep in sync manually.

To cut a new version: bump `__version__`, commit, tag.

---

## Troubleshooting

**`python dev.py` says "Backend venv not found"**
→ You haven't run the install script yet. Run `./install.sh` (or `install.ps1` on Windows).

**"Failed to start Postgres. Is Docker Desktop running?"**
→ Open Docker Desktop and wait for the whale icon to settle. Try again.

**Port 8000 / 5173 / 5432 already in use**
→ Stop whatever's using them, or change them: backend in `dev.py` (`--port`), frontend in `frontend/vite.config.ts`, Postgres in `docker-compose.yml`.

**Can't sign in after changing `ADMIN_PASSWORD` in `.env`**
→ The bootstrap only runs when the admin **doesn't exist**. Reset the password manually:
```bash
cd backend && .venv/bin/python -m scripts.create_admin admin new-password
```
Or wipe the DB to start over: `docker compose down -v`, then `python dev.py`.

**Windows: PowerShell refuses to run `install.ps1`**
→ Run with `powershell -ExecutionPolicy Bypass -File install.ps1` (the docs above show this).

**npm install fails on Windows with permission errors**
→ Close any editor / file watcher locking `node_modules`, then re-run.

---

## What's intentionally not here (yet)

- Cross-source search / full-text search.
- Alerting, retention policies.
- Multi-user / RBAC.
- Alembic migrations (`Base.metadata.create_all` is used today; add Alembic before any schema change in production).
