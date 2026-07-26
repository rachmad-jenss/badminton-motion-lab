# Install / start Badminton Motion Lab Local Agent (Windows)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..\apps\agent")
Set-Location $Root

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  Write-Error "Python 3.11+ is required on PATH."
}

$pythonVersion = & python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
if ([version]$pythonVersion -lt [version]'3.11') {
  Write-Error "Python 3.11+ is required; found $pythonVersion."
}

if (-not (Get-Command ffprobe -ErrorAction SilentlyContinue)) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Error "FFmpeg/ffprobe is required. Install FFmpeg and restart this installer."
  }
  Write-Host "FFmpeg not found; installing the Gyan.FFmpeg winget package..."
  winget install --id Gyan.FFmpeg.Shared -e --accept-source-agreements --accept-package-agreements
  if (-not (Get-Command ffprobe -ErrorAction SilentlyContinue)) {
    Write-Error "FFmpeg was installed but ffprobe is not on PATH yet. Restart PowerShell and rerun."
  }
}

if (-not (Test-Path ".venv")) {
  python -m venv .venv
}

& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt

New-Item -ItemType Directory -Force -Path models | Out-Null
$model = "models/pose_landmarker_full.task"
if (-not (Test-Path $model)) {
  Invoke-WebRequest -Uri "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task" -OutFile $model
}

Write-Host "Starting Local Agent on http://127.0.0.1:8787 ..."
& .\.venv\Scripts\python.exe main.py
