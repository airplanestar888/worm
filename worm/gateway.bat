@echo off
cd /d %~dp0
if not exist node_modules (
  call npm.cmd install
  if errorlevel 1 goto failed
)
if "%PORT%"=="" set PORT=3842

netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo Worm already appears to be running on port %PORT%.
  echo Opening http://localhost:%PORT% ...
  start "" "http://localhost:%PORT%"
  goto end
)

call npm.cmd start
if errorlevel 1 goto failed
goto end

:failed
echo.
echo Worm gateway stopped.
echo If you see EADDRINUSE, Worm is probably already running on port %PORT%.
echo Open http://localhost:%PORT% or close the existing gateway before starting again.
echo.
pause

:end
