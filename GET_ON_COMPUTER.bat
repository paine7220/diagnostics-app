@echo off
cd /d "%~dp0"

if not exist "%~dp0web\index.html" (
  echo Unzip the whole project folder first.
  echo This file must sit next to the web folder.
  pause
  exit /b 1
)

echo Opening Auto/Truck Diagnostics for Dummies on this computer...
echo This is the full offline app. Chrome or Edge is best.
start "" "%~dp0web\index.html"
echo.
echo You are done. The app is running in your browser.
echo.
echo Optional Windows desktop window:
echo   1. Install Node.js LTS from https://nodejs.org
echo   2. Double-click windows\START_APP_FOR_TESTING.bat
echo.
echo Optional Setup EXE / Portable EXE:
echo   Double-click windows\BUILD_WINDOWS_INSTALLER.bat
echo.
pause
