# Install / start Badminton Motion Lab Local Agent (Windows)

param(
  [switch]$LaunchBrowser
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..\apps\agent")
Set-Location $Root

function Refresh-Path {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machinePath;$userPath"
}

function Resolve-Python {
  $command = Get-Command python -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "Python 3.11+ is required. Install it from python.org, then run install-agent.cmd again."
  }

  Write-Host "[1/5] Python not found; installing Python 3.13 for this Windows user..."
  winget install --id Python.Python.3.13 -e --accept-source-agreements --accept-package-agreements
  Refresh-Path
  $command = Get-Command python -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "Python was installed but is not on PATH yet. Close this window, open a new one, and run install-agent.cmd again."
  }
  return $command.Source
}

$python = Resolve-Python
$pythonVersion = & $python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
if ([version]$pythonVersion -lt [version]'3.11') {
  throw "Python 3.11+ is required; found $pythonVersion. Install a newer Python and run install-agent.cmd again."
}

if (-not (Get-Command ffprobe -ErrorAction SilentlyContinue)) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "FFmpeg/ffprobe is required. Install FFmpeg, add it to PATH, and run install-agent.cmd again."
  }
  Write-Host "[2/5] FFmpeg not found; installing the Gyan.FFmpeg winget package..."
  winget install --id Gyan.FFmpeg.Shared -e --accept-source-agreements --accept-package-agreements
  Refresh-Path
  if (-not (Get-Command ffprobe -ErrorAction SilentlyContinue)) {
    throw "FFmpeg was installed but ffprobe is not on PATH yet. Close this window, open a new one, and run install-agent.cmd again."
  }
}

if (-not (Test-Path ".venv")) {
  Write-Host "[3/5] Creating the Local Agent environment..."
  & $python -m venv .venv
}

Write-Host "[4/5] Installing Local Agent dependencies..."
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
  throw "Pose model checksum mismatch: $installedModelSha256. Delete apps\agent\models\pose_landmarker_full.task and run install-agent.cmd again."
}

Write-Host "[5/5] Local Agent is installed and ready."
if ($LaunchBrowser) {
  $agentProcess = $null
  try {
    $agentProcess = Start-Process -FilePath (Join-Path $Root ".venv\Scripts\python.exe") `
      -ArgumentList "main.py" -WorkingDirectory $Root -WindowStyle Normal -PassThru
    $healthy = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
      Start-Sleep -Seconds 1
      try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:8787/health" -TimeoutSec 2
        if ($health.ok -eq $true) { $healthy = $true; break }
      } catch {
        # The agent may still be loading its model.
      }
    }
    if (-not $healthy) { throw "The Local Agent did not become healthy within 30 seconds." }
    try {
      Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3001/agent" -TimeoutSec 3 | Out-Null
      Start-Process "http://127.0.0.1:3001/agent"
      Write-Host "The setup page is open. Pair this browser, then choose a video."
    } catch {
      Write-Host "The Local Agent is ready at http://127.0.0.1:8787. Start the web app, then open /agent."
    }
    Write-Host "Keep the Local Agent console open while analyzing. Close it when you are done."
    exit 0
  } catch {
    if ($agentProcess -and -not $agentProcess.HasExited) { Stop-Process -Id $agentProcess.Id -Force }
    throw
  }
}

Write-Host "Starting Local Agent on http://127.0.0.1:8787 ..."
& .\.venv\Scripts\python.exe main.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
