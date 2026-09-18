@echo off
setlocal
cd /d "%~dp0"

if not exist web\index.html (
  echo Run this from the project root so web\ is visible.
  exit /b 1
)

rmdir /s /q windows\app 2>nul
mkdir windows\app
xcopy /e /i /y web windows\app >nul

rmdir /s /q ios\www 2>nul
mkdir ios\www
xcopy /e /i /y web ios\www >nul

if exist ios\ios\App\App (
  rmdir /s /q ios\ios\App\App\public 2>nul
  mkdir ios\ios\App\App\public
  xcopy /e /i /y web ios\ios\App\App\public >nul
  type nul > ios\ios\App\App\public\cordova.js
  type nul > ios\ios\App\App\public\cordova_plugins.js
)

echo Synced web\ -^> windows\app, ios\www, and iOS public folder
