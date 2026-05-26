@echo off
setlocal

cd /d "%~dp0"

echo Starting WordFlow AI in desktop dev mode...
call npm run desktop:dev
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo The desktop dev environment exited with code %EXIT_CODE%.
)

exit /b %EXIT_CODE%
