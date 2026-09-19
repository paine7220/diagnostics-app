@echo off
cd /d "%~dp0"
if not exist "%~dp0index.html" (
  echo This launcher must stay in the same folder as index.html.
  pause
  exit /b 1
)
echo Opening Auto/Truck Diagnostics for Dummies on this computer...
start "" "%~dp0index.html"
