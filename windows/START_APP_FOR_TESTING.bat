@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is required for this test launcher.& pause & exit /b 1)
if not exist node_modules call npm install
if errorlevel 1 (
  echo npm install failed.
  pause
  exit /b 1
)
call npm start
