"""Build a redistributable zip of the current git HEAD.

Usage:
    python package.py

Output:
    dist/dataplatform-<version>.zip

The version is read from backend/app/__init__.py (single source of truth).
Only files tracked by git are included — no .venv, no node_modules, no .env.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
VERSION_FILE = ROOT / "backend" / "app" / "__init__.py"
DIST = ROOT / "dist"


def read_version() -> str:
    text = VERSION_FILE.read_text(encoding="utf-8")
    m = re.search(r'^__version__\s*=\s*["\']([^"\']+)["\']', text, re.MULTILINE)
    if not m:
        print(f"[X] Could not find __version__ in {VERSION_FILE}", file=sys.stderr)
        sys.exit(1)
    return m.group(1)


def main() -> int:
    if not (ROOT / ".git").exists():
        print(
            "[X] This script uses `git archive` — run it from inside a git checkout.",
            file=sys.stderr,
        )
        return 1

    version = read_version()
    DIST.mkdir(exist_ok=True)
    out = DIST / f"dataplatform-{version}.zip"

    print(f"==> Building {out.relative_to(ROOT)} from git HEAD")
    # No --prefix: files sit at the zip root. Windows "Extract All" then creates
    # a single folder named after the zip (avoiding a doubled directory level).
    r = subprocess.run(
        [
            "git",
            "archive",
            "--format=zip",
            "-o",
            str(out),
            "HEAD",
        ],
        cwd=ROOT,
    )
    if r.returncode != 0:
        return r.returncode

    size_kb = out.stat().st_size // 1024
    print(f"[OK] Wrote {out.relative_to(ROOT)} ({size_kb} KB)")
    print()
    print("To use it on another machine:")
    print(f"  1. Copy {out.name} there")
    print("  2. Windows: right-click the zip -> Extract All (creates one folder)")
    print(f"     macOS/Linux: unzip -d dataplatform-{version} {out.name}")
    print(f"  3. cd into the extracted folder")
    print("  4. ./install.sh        # macOS/Ubuntu")
    print("     install.ps1          # Windows")
    print("  5. python dev.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
