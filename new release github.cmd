@echo off
setlocal EnableExtensions

cd /d "%~dp0" || (
  echo Could not switch to the project root.
  exit /b 1
)

echo Running GitHub release publish...
call "%~dp0publish-release.cmd" %*
set "EXIT_CODE=%ERRORLEVEL%"

if "%EXIT_CODE%"=="0" (
  echo.
  echo new release github completed successfully.
) else (
  echo.
  echo new release github failed with exit code %EXIT_CODE%.
)

exit /b %EXIT_CODE%
