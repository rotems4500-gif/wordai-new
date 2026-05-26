@echo off
setlocal EnableExtensions

set "VERSION_TYPE=patch"
set "PAUSE_ON_EXIT=1"
set "DRY_RUN=0"
set "EXIT_CODE=0"
set "NPM_CMD=npm.cmd"

:parse_args
if "%~1"=="" goto after_parse
if /i "%~1"=="patch" (
  set "VERSION_TYPE=patch"
  shift
  goto parse_args
)
if /i "%~1"=="minor" (
  set "VERSION_TYPE=minor"
  shift
  goto parse_args
)
if /i "%~1"=="major" (
  set "VERSION_TYPE=major"
  shift
  goto parse_args
)
if /i "%~1"=="--no-pause" (
  set "PAUSE_ON_EXIT=0"
  shift
  goto parse_args
)
if /i "%~1"=="--dry-run" (
  set "DRY_RUN=1"
  shift
  goto parse_args
)
echo Unknown argument: %~1
set "EXIT_CODE=1"
goto finish

:after_parse
cd /d "%~dp0" || (
  echo Could not switch to the project root.
  set "EXIT_CODE=1"
  goto finish
)

where npm.cmd >nul 2>nul || (
  where npm >nul 2>nul || (
    echo npm was not found in PATH.
    set "EXIT_CODE=1"
    goto finish
  )
  set "NPM_CMD=npm"
)

for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "(Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version"`) do set "OLD_VERSION=%%v"
if not defined OLD_VERSION (
  echo Could not read the current version from package.json.
  set "EXIT_CODE=1"
  goto finish
)

if "%DRY_RUN%"=="1" (
  echo Current version: %OLD_VERSION%
  echo Next step: %NPM_CMD% version %VERSION_TYPE% --no-git-tag-version
  echo Next step: %NPM_CMD% run dist:win
  goto finish
)

echo Current version: %OLD_VERSION%
call %NPM_CMD% version %VERSION_TYPE% --no-git-tag-version
if errorlevel 1 (
  echo Version bump failed.
  set "EXIT_CODE=1"
  goto finish
)

for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "(Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version"`) do set "NEW_VERSION=%%v"
if not defined NEW_VERSION (
  echo Could not read the new version from package.json.
  call %NPM_CMD% version %OLD_VERSION% --no-git-tag-version >nul 2>nul
  set "EXIT_CODE=1"
  goto finish
)

echo Building installer for version %NEW_VERSION%...
call %NPM_CMD% run dist:win
if errorlevel 1 (
  echo Build failed. Reverting version back to %OLD_VERSION%...
  call %NPM_CMD% version %OLD_VERSION% --no-git-tag-version >nul 2>nul
  set "EXIT_CODE=1"
  goto finish
)

set "INSTALLER_PATH=%CD%\release\WordFlow-AI-Setup-%NEW_VERSION%.exe"
echo.
if exist "%INSTALLER_PATH%" (
  echo Installer created: %INSTALLER_PATH%
) else (
  echo Build finished, but the installer was not found at the expected path:
  echo %INSTALLER_PATH%
)

:finish
if "%PAUSE_ON_EXIT%"=="1" pause
exit /b %EXIT_CODE%