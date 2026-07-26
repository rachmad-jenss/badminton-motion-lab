@echo off
setlocal
REM Build a reproducible developer bundle. Signing and MSI wrapping belong to release infrastructure.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0package-agent.ps1"
if errorlevel 1 exit /b %errorlevel%
endlocal
