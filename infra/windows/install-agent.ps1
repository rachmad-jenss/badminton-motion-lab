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
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

New-Item -ItemType Directory -Force -Path models | Out-Null
$model = "models/pose_landmarker_full.task"
$expectedModelSha256 = "5134A3AAD27A58B93DA0088D431F366DA362B44E3CCFBE3462B3827A839011B1"
if (-not (Test-Path $model)) {
  $download = "$model.download"
  try {
    Invoke-WebRequest -Uri "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task" -OutFile $download
    $actual = (Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash
    if ($actual -ne $expectedModelSha256) { throw "Pose model checksum mismatch: $actual" }
    Move-Item -LiteralPath $download -Destination $model -Force
  } catch {
    if (Test-Path -LiteralPath $download) { Remove-Item -LiteralPath $download -Force }
    throw
  }
}
$installedModelSha256 = (Get-FileHash -LiteralPath $model -Algorithm SHA256).Hash
if ($installedModelSha256 -ne $expectedModelSha256) {
  Write-Error "Pose model checksum mismatch: $installedModelSha256"
  exit 1
}

Write-Host "Starting Local Agent on http://127.0.0.1:8787 ..."
& .\.venv\Scripts\python.exe main.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
