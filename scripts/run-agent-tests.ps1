$ErrorActionPreference = "Stop"
$agentRoot = Join-Path $PSScriptRoot "..\apps\agent"
$python = Join-Path $agentRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python)) {
  $python = (Get-Command python -ErrorAction Stop).Source
}
Push-Location $agentRoot
$exitCode = 0
try {
  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("bml-agent-tests-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
  & $python -m pytest test_security.py test_integrity.py test_storage.py -q -p no:cacheprovider --basetemp $tempRoot
  if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE }
  if ($exitCode -eq 0) {
    & $python smoke_test.py
    if ($LASTEXITCODE -ne 0) { $exitCode = $LASTEXITCODE }
  }
} finally {
  Pop-Location
}
if ($exitCode -ne 0) { exit $exitCode }
