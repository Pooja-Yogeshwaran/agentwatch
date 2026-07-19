@echo off
REM Double-click this file to open the agentwatch dashboard in your browser.
REM No terminal typing needed.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install it from https://nodejs.org then run this again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo First-time setup: installing dependencies. This runs once and may take a minute...
  call npm install
)
echo.
echo Starting the agentwatch dashboard - your browser will open shortly.
echo Keep this window open while you use it. Close it to stop the dashboard.
echo.
node bin\agentwatch dashboard
pause
