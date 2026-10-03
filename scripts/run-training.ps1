$ErrorActionPreference = "Stop"
$agentRoot = Join-Path $PSScriptRoot "..\apps\agent"
$python = Join-Path $agentRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python)) {
  $python = (Get-Command python -ErrorAction Stop).Source
}
if ($args.Count -lt 1) {
  throw "Usage: run-training.ps1 smoke|run [options]"
}
$mode = $args[0]
$trainingArgs = @()
if ($args.Count -gt 1) {
  $trainingArgs = $args[1..($args.Count - 1)]
}
Push-Location $agentRoot
try {
  & $python -m training.cli $mode @trainingArgs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}
