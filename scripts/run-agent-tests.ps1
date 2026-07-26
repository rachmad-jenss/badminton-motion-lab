$ErrorActionPreference = "Stop"
$agentRoot = Join-Path $PSScriptRoot "..\apps\agent"
$python = Join-Path $agentRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python)) {
  $python = (Get-Command python -ErrorAction Stop).Source
}
Push-Location $agentRoot
try {
  $tempRoot = Join-Path $agentRoot ".pytest-temp"
  New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
  & $python -m pytest test_security.py -q -p no:cacheprovider --basetemp $tempRoot
  & $python smoke_test.py
} finally {
  Pop-Location
}
