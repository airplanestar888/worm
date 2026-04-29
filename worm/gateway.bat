@echo off
:: Re-launch in a persistent cmd /k window if not already inside one
if not defined WORM_GATEWAY_RUNNING (
  set WORM_GATEWAY_RUNNING=1
  start "Worm Gateway" cmd /k ""%~f0""
  exit
)

title Worm Gateway
cd /d %~dp0

if "%PORT%"=="" set PORT=3842

echo ============================================================
echo  Worm Gateway  ^|  Port %PORT%
echo  Ctrl+C to stop  ^|  Close window to exit
echo ============================================================
echo.

:: Install deps if missing
if not exist node_modules (
  echo [setup] Installing dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed. Check your Node.js installation.
    echo.
    goto end
  )
  echo.
)

:: Kill any existing process occupying the port
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  echo [info] Killing old process on port %PORT% ^(PID %%p^)...
  taskkill /PID %%p /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo [start] Running: node server/worm.js
echo.

node server/worm.js

echo.
echo ============================================================
echo  [Worm stopped]
echo ============================================================

:end
echo.
echo  Press any key to close this window...
pause >nul
