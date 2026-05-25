"""Dev runner — starts Postgres, backend, and frontend in one command.

Usage:
    python dev.py

Press Ctrl-C to stop everything. Postgres keeps running in Docker; stop it with
`docker compose down` when you're truly done.
"""
from __future__ import annotations

import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"

IS_WIN = sys.platform == "win32"
VENV_PY = (
    BACKEND / ".venv" / ("Scripts" if IS_WIN else "bin") / ("python.exe" if IS_WIN else "python")
)

# --- pretty output --------------------------------------------------------
if sys.stdout.isatty():
    CYAN, GREEN, RED, YELLOW, DIM, RESET = (
        "\033[36m", "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"
    )
else:
    CYAN = GREEN = RED = YELLOW = DIM = RESET = ""


def info(msg: str) -> None:
    print(f"{CYAN}==>{RESET} {msg}", flush=True)


def ok(msg: str) -> None:
    print(f"{GREEN}[OK]{RESET} {msg}", flush=True)


def warn(msg: str) -> None:
    print(f"{YELLOW}[!]{RESET} {msg}", flush=True)


def die(msg: str) -> None:
    print(f"{RED}[X]{RESET} {msg}", file=sys.stderr, flush=True)
    sys.exit(1)


# --- prereq checks --------------------------------------------------------
def check_prereqs() -> tuple[str, str]:
    if not VENV_PY.exists():
        die(
            f"Backend venv not found at {VENV_PY}.\n"
            f"    Run ./install.sh (macOS/Ubuntu) or install.ps1 (Windows) first."
        )
    if not (FRONTEND / "node_modules").exists():
        die(
            "Frontend node_modules not found.\n"
            "    Run ./install.sh (macOS/Ubuntu) or install.ps1 (Windows) first."
        )

    docker = shutil.which("docker")
    if not docker:
        die("docker not found on PATH. Install Docker Desktop and re-open your terminal.")

    npm = shutil.which("npm") or (shutil.which("npm.cmd") if IS_WIN else None)
    if not npm:
        die("npm not found on PATH.")

    return docker, npm


# --- start Postgres -------------------------------------------------------
def start_postgres(docker: str) -> None:
    info("Starting Postgres (docker compose up -d)")
    r = subprocess.run([docker, "compose", "up", "-d"], cwd=ROOT)
    if r.returncode != 0:
        die("Failed to start Postgres. Is Docker Desktop running?")

    info("Waiting for Postgres to accept connections")
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        r = subprocess.run(
            [docker, "compose", "exec", "-T", "postgres", "pg_isready", "-U", "dataplatform"],
            cwd=ROOT,
            capture_output=True,
        )
        if r.returncode == 0:
            ok("Postgres is ready")
            return
        time.sleep(1)
    die("Postgres did not become ready within 60s. Check `docker compose logs postgres`.")


# --- main -----------------------------------------------------------------
def main() -> int:
    docker, npm = check_prereqs()
    start_postgres(docker)

    info("Starting backend (uvicorn) on http://localhost:8000")
    backend = subprocess.Popen(
        [str(VENV_PY), "-m", "uvicorn", "app.main:app", "--reload", "--port", "8000"],
        cwd=BACKEND,
    )

    info("Starting frontend (vite) on http://localhost:5173")
    frontend = subprocess.Popen([npm, "run", "dev"], cwd=FRONTEND)

    print()
    ok("Everything is up.")
    print(f"    {DIM}Open{RESET}    http://localhost:5173")
    print(f"    {DIM}API docs{RESET}  http://localhost:8000/docs")
    print(f"    {DIM}Stop{RESET}      Ctrl-C\n")

    children = [("frontend", frontend), ("backend", backend)]
    exit_code = 0
    try:
        while True:
            time.sleep(1)
            for name, p in children:
                if p.poll() is not None:
                    warn(f"{name} exited (code {p.returncode})")
                    exit_code = p.returncode or 1
                    raise KeyboardInterrupt
    except KeyboardInterrupt:
        print()
        info("Shutting down")
    finally:
        for name, p in children:
            if p.poll() is None:
                p.terminate()
                try:
                    p.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    warn(f"{name} did not exit cleanly, killing")
                    p.kill()
                    p.wait()
        ok("Stopped. Postgres is still running — use `docker compose down` to stop it.")

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
