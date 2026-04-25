#!/usr/bin/env bash
# Install script for macOS / Linux.
# Verifies prerequisites, creates the backend venv, installs Python + npm deps,
# and copies .env.example to .env. Idempotent — safe to re-run.
set -euo pipefail

cd "$(dirname "$0")"

# --- pretty output --------------------------------------------------------
if [ -t 1 ]; then
  BOLD=$'\e[1m'; DIM=$'\e[2m'; RED=$'\e[31m'; GREEN=$'\e[32m'; YELLOW=$'\e[33m'; RESET=$'\e[0m'
else
  BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; RESET=""
fi
info()  { printf "%s==>%s %s\n" "$BOLD" "$RESET" "$1"; }
ok()    { printf "%s✓%s %s\n"  "$GREEN" "$RESET" "$1"; }
warn()  { printf "%s!%s %s\n"  "$YELLOW" "$RESET" "$1"; }
fail()  { printf "%s✗%s %s\n"  "$RED" "$RESET" "$1" >&2; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }

# --- 1. Python 3.11+ ------------------------------------------------------
info "Checking for Python 3.11+"
PY_CMD=""
for cmd in python3.13 python3.12 python3.11 python3 python; do
  if have "$cmd"; then
    ver=$("$cmd" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || echo "")
    if [ -n "$ver" ]; then
      major=${ver%.*}; minor=${ver#*.}
      if [ "$major" = "3" ] && [ "$minor" -ge 11 ]; then
        PY_CMD="$cmd"
        ok "Found $cmd ($ver)"
        break
      fi
    fi
  fi
done
[ -n "$PY_CMD" ] || fail "Python 3.11+ not found. Install from https://www.python.org/downloads/ (or 'brew install python@3.12' on macOS, 'sudo apt install python3.12 python3.12-venv' on Ubuntu)."

# --- 2. Node.js 18+ -------------------------------------------------------
info "Checking for Node.js 18+"
have node || fail "Node.js not found. Install from https://nodejs.org/ (or 'brew install node' on macOS, 'sudo apt install nodejs npm' on Ubuntu)."
node_ver=$(node -v | sed 's/^v//')
node_major=${node_ver%%.*}
[ "$node_major" -ge 18 ] || fail "Node 18+ required, found $node_ver."
ok "Found node $node_ver"

have npm || fail "npm not found (usually ships with Node.js)."
ok "Found npm $(npm -v)"

# --- 3. Docker (warn only — needed for Postgres) --------------------------
info "Checking for Docker"
if have docker; then
  ok "Found docker $(docker --version | awk '{print $3}' | tr -d ',')"
else
  warn "Docker not found. You'll need it to run Postgres locally."
  warn "  macOS: https://www.docker.com/products/docker-desktop/"
  warn "  Ubuntu: https://docs.docker.com/engine/install/ubuntu/"
fi

# --- 4. Backend: venv + pip install --------------------------------------
info "Setting up backend venv (backend/.venv)"
cd backend
if [ ! -d .venv ]; then
  "$PY_CMD" -m venv .venv
  ok "Created venv"
else
  ok "venv already exists"
fi

# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install --upgrade pip >/dev/null
info "Installing backend package (editable) with dependencies"
pip install -e .
ok "Backend package installed"

if [ ! -f .env ]; then
  cp .env.example .env
  ok "Created backend/.env from .env.example"
else
  ok "backend/.env already exists (left as-is)"
fi
deactivate
cd ..

# --- 5. Frontend: npm install --------------------------------------------
info "Installing frontend dependencies (frontend/)"
cd frontend
npm install
ok "Frontend dependencies installed"
cd ..

# --- next steps ----------------------------------------------------------
cat <<EOF

${GREEN}${BOLD}Setup complete.${RESET}

${BOLD}Next steps${RESET} (3 terminals):

  ${DIM}# 1. Start Postgres${RESET}
  docker compose up -d

  ${DIM}# 2. Backend${RESET}
  cd backend
  source .venv/bin/activate
  python -m scripts.create_admin admin changeme
  uvicorn app.main:app --reload

  ${DIM}# 3. Frontend${RESET}
  cd frontend
  npm run dev

Then open ${BOLD}http://localhost:5173${RESET} and sign in as ${BOLD}admin / changeme${RESET}.
EOF
