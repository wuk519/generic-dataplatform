# Install script for Windows (PowerShell 5.1 or 7+).
# Verifies prerequisites, creates the backend venv, installs Python + npm deps,
# and copies .env.example to .env. Idempotent - safe to re-run.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File install.ps1
$ErrorActionPreference = "Stop"

Set-Location -Path $PSScriptRoot

function Info($msg)  { Write-Host "==> $msg" -ForegroundColor Cyan }
function Ok($msg)    { Write-Host "[OK] $msg" -ForegroundColor Green }
function Warn($msg)  { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Fail($msg)  { Write-Host "[X] $msg" -ForegroundColor Red; exit 1 }

function Have($cmd) {
    return [bool](Get-Command $cmd -ErrorAction SilentlyContinue)
}

# --- 1. Python 3.11+ ------------------------------------------------------
Info "Checking for Python 3.11+"
$pyCmd = $null
foreach ($candidate in @("python", "python3", "py")) {
    if (Have $candidate) {
        try {
            $verOutput = & $candidate -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
            if ($LASTEXITCODE -eq 0 -and $verOutput) {
                $parts = $verOutput.Trim().Split('.')
                $major = [int]$parts[0]
                $minor = [int]$parts[1]
                if ($major -eq 3 -and $minor -ge 11) {
                    $pyCmd = $candidate
                    Ok "Found $candidate ($verOutput)"
                    break
                }
            }
        } catch { }
    }
}
if (-not $pyCmd) {
    Fail "Python 3.11+ not found. Install from https://www.python.org/downloads/ (make sure 'Add Python to PATH' is checked)."
}

# --- 2. Node.js 18+ -------------------------------------------------------
Info "Checking for Node.js 18+"
if (-not (Have "node")) {
    Fail "Node.js not found. Install from https://nodejs.org/"
}
$nodeVer = (& node -v).TrimStart("v")
$nodeMajor = [int]($nodeVer.Split('.')[0])
if ($nodeMajor -lt 18) {
    Fail "Node 18+ required, found $nodeVer."
}
Ok "Found node $nodeVer"

if (-not (Have "npm")) {
    Fail "npm not found (usually ships with Node.js)."
}
Ok ("Found npm " + (& npm -v))

# --- 3. Docker (warn only) ------------------------------------------------
Info "Checking for Docker"
if (Have "docker") {
    Ok ("Found " + (& docker --version))
} else {
    Warn "Docker not found. You'll need it to run Postgres locally."
    Warn "  Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
}

# --- 4. Backend: venv + pip install --------------------------------------
Info "Setting up backend venv (backend\.venv)"
Push-Location backend
try {
    if (-not (Test-Path ".venv")) {
        & $pyCmd -m venv .venv
        if ($LASTEXITCODE -ne 0) { Fail "Failed to create venv" }
        Ok "Created venv"
    } else {
        Ok "venv already exists"
    }

    $venvPython = Join-Path ".venv" "Scripts\python.exe"
    if (-not (Test-Path $venvPython)) {
        Fail "Expected $venvPython after venv creation."
    }

    & $venvPython -m pip install --upgrade pip | Out-Null
    Info "Installing backend package (editable) with dependencies"
    & $venvPython -m pip install -e .
    if ($LASTEXITCODE -ne 0) { Fail "pip install failed" }
    Ok "Backend package installed"

    if (-not (Test-Path ".env")) {
        Copy-Item ".env.example" ".env"
        Ok "Created backend\.env from .env.example"
    } else {
        Ok "backend\.env already exists (left as-is)"
    }
} finally {
    Pop-Location
}

# --- 5. Frontend: npm install --------------------------------------------
Info "Installing frontend dependencies (frontend\)"
Push-Location frontend
try {
    & npm install
    if ($LASTEXITCODE -ne 0) { Fail "npm install failed" }
    Ok "Frontend dependencies installed"
} finally {
    Pop-Location
}

# --- next steps ----------------------------------------------------------
Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps (3 terminals):" -ForegroundColor White
Write-Host ""
Write-Host "  # 1. Start Postgres" -ForegroundColor DarkGray
Write-Host "  docker compose up -d"
Write-Host ""
Write-Host "  # 2. Backend" -ForegroundColor DarkGray
Write-Host "  cd backend"
Write-Host "  .venv\Scripts\Activate.ps1"
Write-Host "  python -m scripts.create_admin admin changeme"
Write-Host "  uvicorn app.main:app --reload"
Write-Host ""
Write-Host "  # 3. Frontend" -ForegroundColor DarkGray
Write-Host "  cd frontend"
Write-Host "  npm run dev"
Write-Host ""
Write-Host "Then open http://localhost:5173 and sign in as admin / changeme." -ForegroundColor White
