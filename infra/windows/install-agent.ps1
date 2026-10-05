# Install / start Badminton Motion Lab Local Agent (Windows)

param(
  [switch]$LaunchBrowser,
  [string]$WebUrl = $env:BML_WEB_URL
)

$ErrorActionPreference = "Stop"
$WebUrl = if ([string]::IsNullOrWhiteSpace($WebUrl)) { "https://bml.jenss.me/agent" } else { $WebUrl.Trim() }
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..\apps\agent")
Set-Location $Root
. (Join-Path $PSScriptRoot "agent-diagnostics.ps1")
$agentConfiguration = Get-AgentConfiguration
$AgentHost = $agentConfiguration.Host
$AgentPort = $agentConfiguration.Port

function Refresh-Path {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machinePath;$userPath"
}

function Test-PythonCommand([string]$commandPath) {
  try {
    & $commandPath -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)" 2>$null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Resolve-Python {
  $command = Get-Command python -ErrorAction SilentlyContinue
  if ($command -and (Test-PythonCommand $command.Source)) { return $command.Source }

  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "Python 3.11+ is required. Install it from python.org, then run install-agent.cmd again."
  }

  Write-Host "[1/5] Python not found; installing Python 3.13 for this Windows user..."
  winget install --id Python.Python.3.13 -e --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) {
    $installExitCode = $LASTEXITCODE
    throw "Python installation failed with exit code $installExitCode. Resolve the winget error, then run install-agent.cmd again."
  }
  Refresh-Path
  $command = Get-Command python -ErrorAction SilentlyContinue
  if (-not $command -or -not (Test-PythonCommand $command.Source)) {
    throw "Python was installed but is not on PATH yet. Close this window, open a new one, and run install-agent.cmd again."
  }
  return $command.Source
}

$python = Resolve-Python
$pythonVersion = & $python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
if ([version]$pythonVersion -lt [version]'3.11') {
  throw "Python 3.11+ is required; found $pythonVersion. Install a newer Python and run install-agent.cmd again."
}

if (-not (Get-Command ffprobe -ErrorAction SilentlyContinue) -or -not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "FFmpeg/ffprobe is required. Install FFmpeg, add it to PATH, and run install-agent.cmd again."
  }
  Write-Host "[2/5] FFmpeg not found; installing the Gyan.FFmpeg winget package..."
  winget install --id Gyan.FFmpeg.Shared -e --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) {
    $installExitCode = $LASTEXITCODE
    throw "FFmpeg installation failed with exit code $installExitCode. Resolve the winget error, then run install-agent.cmd again."
  }
  Refresh-Path
  if (-not (Get-Command ffprobe -ErrorAction SilentlyContinue) -or -not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    throw "FFmpeg was installed but ffmpeg/ffprobe are not on PATH yet. Close this window, open a new one, and run install-agent.cmd again."
  }
}

if (-not (Test-Path ".venv")) {
  Write-Host "[3/5] Creating the Local Agent environment..."
  & $python -m venv .venv
}

Write-Host "[4/5] Installing Local Agent dependencies..."
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& .\.venv\Scripts\python.exe -m pip install -r requirements.lock.txt
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
  $healthy = $false
  try {
    $existingConnections = @(Get-ListeningConnections -Port $AgentPort)
    if ($existingConnections.Count -gt 0) {
      $existingHealth = Get-AgentHealth -AgentHost $AgentHost -Port $AgentPort
      if ($existingHealth.IsCompatibleAgent) {
        $healthy = $true
        Write-Host "A compatible Local Agent is already healthy on port $AgentPort. Reusing it."
      } else {
        $existingOwners = @(Get-ListeningProcessDetails -Connections $existingConnections)
        throw (Format-PortConflictMessage -Port $AgentPort -Connections $existingConnections -Owners $existingOwners -AgentHost $AgentHost)
      }
    }

    if (-not $healthy) {
      $agentProcess = Start-Process -FilePath (Join-Path $Root ".venv\Scripts\python.exe") `
        -ArgumentList "main.py" -WorkingDirectory $Root -WindowStyle Normal -PassThru
      for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Seconds 1
        if ($agentProcess.HasExited) {
          $exitedConnections = @(Get-ListeningConnections -Port $AgentPort)
          $exitedConflicts = @($exitedConnections | Where-Object { $_.OwningProcess -ne $agentProcess.Id })
          if ($exitedConflicts.Count -gt 0) {
            $exitedOwners = @(Get-ListeningProcessDetails -Connections $exitedConflicts)
            throw (Format-PortConflictMessage -Port $AgentPort -Connections $exitedConflicts -Owners $exitedOwners -AgentHost $AgentHost)
          }
          throw "The Local Agent exited before becoming healthy (exit code $($agentProcess.ExitCode))."
        }

        $connections = @(Get-ListeningConnections -Port $AgentPort)
        $health = Get-AgentHealth -AgentHost $AgentHost -Port $AgentPort
        if ($health.IsCompatibleAgent) {
          $agentOwnsPort = @($connections | Where-Object { $_.OwningProcess -eq $agentProcess.Id }).Count -gt 0
          if (-not $agentOwnsPort -and $connections.Count -gt 0) {
            Write-Host "Another compatible Local Agent became healthy on port $AgentPort. Reusing it."
            Stop-Process -Id $agentProcess.Id -Force
            $agentProcess = $null
          }
          $healthy = $true
          break
        }

        if ($connections.Count -gt 0 -and @($connections | Where-Object { $_.OwningProcess -ne $agentProcess.Id }).Count -gt 0) {
          $owners = @(Get-ListeningProcessDetails -Connections $connections)
          throw (Format-PortConflictMessage -Port $AgentPort -Connections $connections -Owners $owners -AgentHost $AgentHost)
        }
      }
    }
    if (-not $healthy) { throw "The Local Agent did not become healthy within 30 seconds at $((Get-AgentHealthUri -AgentHost $AgentHost -Port $AgentPort))." }
    try {
      Invoke-WebRequest -UseBasicParsing -Uri $WebUrl -TimeoutSec 5 | Out-Null
      Start-Process $WebUrl
      Write-Host "The setup page is open. Pair this browser, then choose a video."
    } catch {
      Write-Host "The Local Agent is ready at $((Get-AgentHealthUri -AgentHost $AgentHost -Port $AgentPort) -replace '/health$',''). Open $WebUrl to pair this browser."
    }
    Write-Host "Keep the Local Agent console open while analyzing. Close it when you are done."
    exit 0
  } catch {
    if ($agentProcess -and -not $agentProcess.HasExited) { Stop-Process -Id $agentProcess.Id -Force }
    throw
  }
}

Write-Host "Starting Local Agent on $((Get-AgentHealthUri -AgentHost $AgentHost -Port $AgentPort) -replace '/health$','') ..."
& .\.venv\Scripts\python.exe main.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
