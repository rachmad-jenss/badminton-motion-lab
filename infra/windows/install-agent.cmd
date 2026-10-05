@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-agent.ps1" -LaunchBrowser
set "exitCode=%errorlevel%"
if not "%exitCode%"=="0" (
  echo.
  echo Local Agent setup did not finish. Read the diagnostic message above, resolve the reported issue, and run this file again.
  pause
)
exit /b %exitCode%
