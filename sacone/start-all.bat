@echo off
title SACONE Launcher
cd /d "%~dp0"

echo ============================================
echo   SACONE local server - API + ERP + Owner + gateway + SAC-POS
echo ============================================

where node >nul 2>nul || (echo [X] Node.js not found. Install Node 20+ from nodejs.org & pause & exit /b 1)

if not exist "node_modules" call npm install
if not exist "sacone-api\node_modules" call npm install --prefix sacone-api
if not exist "sacone-erp\node_modules" call npm install --prefix sacone-erp
if not exist "sacone-owner\node_modules" call npm install --prefix sacone-owner
if not exist "sac-pos\node_modules" call npm install --prefix sac-pos

echo.
echo [1/6] Applying database migrations (safe, non-destructive)...
call npm run db:setup --prefix sacone-api

echo [2/6] Starting API on http://localhost:4000 (also reachable on your LAN) ...
start "SACONE API :4000" cmd /k "cd /d "%~dp0sacone-api" && npm run dev"

echo [3/6] Starting ERP web app on http://localhost:3000 ...
start "SACONE ERP :3000" cmd /k "cd /d "%~dp0sacone-erp" && npm run dev"

echo [4/6] Starting SACONE Owner (CEO Dashboard, Income ^& Expense) on http://localhost:3001 ...
start "SACONE Owner :3001" cmd /k "cd /d "%~dp0sacone-owner" && npm run dev"

echo [5/6] Starting the local-domain gateway (erp./owner./api.sacone.local) ...
start "SACONE gateway" cmd /k "cd /d "%~dp0" && node local-server\gateway.mjs"

echo [6/6] Starting SAC-POS (Expo) - scan the QR code with the Expo Go app ...
start "SAC-POS (Expo)" cmd /k "cd /d "%~dp0sac-pos" && npx expo start"

echo.
echo Waiting for the ERP to compile...
timeout /t 12 /nobreak >nul
start "" http://localhost:3000

echo.
echo  ERP         : http://erp.sacone.local    or http://localhost:3000   (admin@sacone.local / Admin@123)
echo  Owner app   : http://owner.sacone.local  or http://localhost:3001   (same login)
echo  (*.sacone.local needs a one-time hosts entry: see local-server\README.md)
echo  SAC-POS     : ERP - POS Devices ^& Sync - Register device, then on the phone enter
echo                the server URL with this PC's LAN IP (see below) and the device key.
echo.
echo  This PC's IP addresses:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4"') do for /f "tokens=*" %%b in ("%%a") do echo     http://%%b:4000
echo.
echo  Close the opened windows to stop the apps.
echo.
pause
exit /b 0
