@echo off
setlocal EnableExtensions

cd /d "%~dp0" || (
  echo Could not switch to the project root.
  exit /b 1
)

echo Running local release build...
call "%~dp0build-installer.cmd" %*
set "EXIT_CODE=%ERRORLEVEL%"

if "%EXIT_CODE%"=="0" (
  echo.
  echo new-release completed successfully.
) else (
  echo.
  echo new-release failed with exit code %EXIT_CODE%.
)

exit /b %EXIT_CODE%
