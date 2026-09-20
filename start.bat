@echo off
REM Recallia Quest - one-click start for Windows. Opens the app in Google Chrome.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get the LTS version from https://nodejs.org & pause & exit /b 1)
node scripts\preflight-node.mjs || (pause & exit /b 1)
if not exist node_modules (
  echo Installing dependencies, please wait...
  call npm install || (echo npm install failed & pause & exit /b 1)
)
echo Building the app...
call npm run build || (echo Build failed & pause & exit /b 1)
REM Open Chrome a few seconds after the server starts (falls back to the default browser).
start "" cmd /c "timeout /t 4 >nul & (start chrome http://localhost:8787 || start http://localhost:8787)"
echo Recallia Quest is running at http://localhost:8787  (close this window to stop)
call npm start
pause
