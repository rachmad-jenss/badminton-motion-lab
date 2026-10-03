$ErrorActionPreference = "Stop"
$agentRoot = Join-Path $PSScriptRoot "..\apps\agent"
$python = Join-Path $agentRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python)) {
  $python = (Get-Command python -ErrorAction Stop).Source
}
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("bml-training-tests-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
Push-Location (Join-Path $PSScriptRoot "..")
try {
  & $python -m pytest apps/agent/test_training.py -q -p no:cacheprovider --basetemp $tempRoot
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}
