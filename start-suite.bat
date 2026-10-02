@echo off
setlocal EnableExtensions
title BillEase Suite Launcher
cd /d "%~dp0"

set "ROOT=%~dp0"
set "SACONE=%ROOT%sacone"
set "POS=%ROOT%sacone\sac-pos"

:menu
cls
echo ==========================================================
echo                 BillEase Suite - Launcher
echo ==========================================================
echo   1. SACONE       (API :4000 + ERP :3000 + Owner app :3001)
echo   2. SAC-POS      (Expo mobile POS - scan QR with Expo Go)
echo   3. Start EVERYTHING
echo   0. Exit
echo ----------------------------------------------------------
set "choice="
set /p choice=Choose [1-3, 0]:
if "%choice%"=="1" call :sacone & goto done
if "%choice%"=="2" call :pos & goto done
if "%choice%"=="3" call :sacone & call :pos & goto done
if "%choice%"=="0" exit /b 0
goto menu

:done
echo.
echo  SACONE ERP : http://localhost:3000   (admin@sacone.local / Admin@123)
echo  Owner app  : http://localhost:3001   (CEO Dashboard + Income ^& Expense, same login)
echo  SAC-POS    : ERP - POS Devices ^& Sync - Register device, then on the phone
echo               enter one of these server URLs and the device key:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4"') do for /f "tokens=*" %%b in ("%%a") do echo                  http://%%b:4000
echo  Close each app window to stop it.
echo.
pause
exit /b 0

rem ---------------------------------------------------------------- SACONE
:sacone
where node >nul 2>nul || (echo [X] Node.js not found - install Node 20+ from nodejs.org & exit /b 1)
echo [SACONE] Checking dependencies...
if not exist "%SACONE%\node_modules" call npm install --prefix "%SACONE%"
if not exist "%SACONE%\sacone-api\node_modules" call npm install --prefix "%SACONE%\sacone-api"
if not exist "%SACONE%\sacone-erp\node_modules" call npm install --prefix "%SACONE%\sacone-erp"
if not exist "%SACONE%\sacone-owner\node_modules" call npm install --prefix "%SACONE%\sacone-owner"
echo [SACONE] Applying database migrations (safe, non-destructive)...
call npm run db:setup --prefix "%SACONE%\sacone-api"
start "SACONE API :4000" cmd /k "cd /d "%SACONE%\sacone-api" && npm run dev"
start "SACONE ERP :3000" cmd /k "cd /d "%SACONE%\sacone-erp" && npm run dev"
start "SACONE Owner :3001" cmd /k "cd /d "%SACONE%\sacone-owner" && npm run dev"
echo [SACONE] Opening the ERP in your browser shortly...
start "" /min cmd /c "timeout /t 15 /nobreak >nul && start http://localhost:3000"
exit /b 0

rem ---------------------------------------------------------------- SAC-POS
:pos
where node >nul 2>nul || (echo [X] Node.js not found - install Node 20+ from nodejs.org & exit /b 1)
if not exist "%POS%\package.json" (echo [X] SAC-POS not found at %POS% & exit /b 1)
if not exist "%POS%\node_modules" (
  echo [SAC-POS] Installing packages ^(first run only^)...
  call npm install --prefix "%POS%"
)
start "SAC-POS (Expo)" cmd /k "cd /d "%POS%" && npx expo start"
exit /b 0
