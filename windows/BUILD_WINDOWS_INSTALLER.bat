@echo off
setlocal
cd /d "%~dp0"

echo Building Auto Truck Diagnostics for Dummies Windows installer...
echo.
echo Azure Trusted Signing is configured in package.json (azureSignOptions):
echo   account : ravin-ai-signing
echo   profile : ravin-ai-public
echo   endpoint: https://eus.codesigning.azure.net/
echo   publisher CN=Michael Paine, O=Michael Paine, L=Superior, S=wi, C=US
echo.
echo For a signed release, set AZURE_CLIENT_ID, AZURE_TENANT_ID, and
echo AZURE_CLIENT_SECRET, or sign in with Azure CLI before this script.
echo Set SKIP_CODE_SIGNING=1 to force an unsigned local build.
echo.

where node >nul 2>nul || (
 echo Node.js is required. Install the current LTS version from nodejs.org, then run this file again.
 pause
 exit /b 1
)

call npm install
if errorlevel 1 goto :fail

if /I "%SKIP_CODE_SIGNING%"=="1" goto :unsigned
if /I "%CSC_IDENTITY_AUTO_DISCOVERY%"=="false" goto :unsigned

call npm run dist:win
if errorlevel 1 (
 echo.
 echo Signed build failed. Building an unsigned installer for local testing.
 echo For a signed release, configure Azure Trusted Signing credentials and rerun.
 echo.
 call npm run dist:win:unsigned
 if errorlevel 1 goto :fail
 goto :done
)
goto :done

:unsigned
echo Building unsigned installer...
call npm run dist:win:unsigned
if errorlevel 1 goto :fail

:done
echo.
echo COMPLETE. Open the dist folder for the one-click Setup EXE and Portable EXE.
start "" "%~dp0dist"
pause
exit /b 0

:fail
echo.
echo BUILD FAILED. Review the error above.
pause
exit /b 1
