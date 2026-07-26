# Build a portable, reproducible Local Agent bundle for Windows development.
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$source = Join-Path $repo "apps\agent"
$dist = Join-Path $repo "dist"
$stage = Join-Path $dist "BML-Agent"
$archive = Join-Path $dist "BML-Agent.zip"
$expectedModelSha256 = "5134A3AAD27A58B93DA0088D431F366DA362B44E3CCFBE3462B3827A839011B1"

if (-not (Test-Path (Join-Path $source "models\pose_landmarker_full.task"))) {
  throw "Pose model missing. Run infra\windows\install-agent.ps1 first."
}
if ((Get-FileHash -LiteralPath (Join-Path $source "models\pose_landmarker_full.task") -Algorithm SHA256).Hash -ne $expectedModelSha256) {
  throw "Pose model checksum mismatch. Run infra\windows\install-agent.ps1 again."
}

New-Item -ItemType Directory -Force -Path $dist | Out-Null
if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stage "apps\agent"), (Join-Path $stage "infra\windows") | Out-Null

Get-ChildItem -LiteralPath $source -Force |
  Where-Object { $_.Name -notin @(".venv", "data", "__pycache__", ".pytest_cache", ".pytest-temp", "test-tmp") } |
  Copy-Item -Destination (Join-Path $stage "apps\agent") -Recurse -Force
Copy-Item -LiteralPath (Join-Path $repo "infra\windows\install-agent.ps1") -Destination (Join-Path $stage "infra\windows") -Force
Copy-Item -LiteralPath (Join-Path $repo "README.md") -Destination $stage -Force

Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $archive -CompressionLevel Optimal
Write-Host "Created $archive"
