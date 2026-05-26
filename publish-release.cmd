@echo off
setlocal EnableExtensions

set "VERSION_TYPE=patch"
set "PAUSE_ON_EXIT=1"
set "DRY_RUN=0"
set "EXIT_CODE=0"
set "NPM_CMD=npm.cmd"
set "GIT_CMD=git.exe"

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

where git.exe >nul 2>nul || (
  where git >nul 2>nul || (
    echo git was not found in PATH.
    set "EXIT_CODE=1"
    goto finish
  )
  set "GIT_CMD=git"
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
  echo Next step: %GIT_CMD% add package.json package-lock.json
  echo Next step: %GIT_CMD% commit -m "release: vNEXT_VERSION"
  echo Next step: %GIT_CMD% tag vNEXT_VERSION
  echo Next step: %GIT_CMD% push origin CURRENT_BRANCH
  echo Next step: %GIT_CMD% push origin vNEXT_VERSION
  echo Next step: %NPM_CMD% run dist:publish
  goto finish
)

for /f "usebackq delims=" %%s in (`%GIT_CMD% status --porcelain`) do set "WORKTREE_DIRTY=1"
if defined WORKTREE_DIRTY (
  echo Git working tree must be clean before publishing.
  set "EXIT_CODE=1"
  goto finish
)

%GIT_CMD% remote get-url origin >nul 2>nul || (
  echo Git remote origin is not configured.
  set "EXIT_CODE=1"
  goto finish
)

for /f "usebackq delims=" %%b in (`%GIT_CMD% branch --show-current`) do set "CURRENT_BRANCH=%%b"
if not defined CURRENT_BRANCH (
  echo Could not resolve the current git branch.
  set "EXIT_CODE=1"
  goto finish
)

if not defined GH_TOKEN if not defined GITHUB_TOKEN (
  echo GH_TOKEN or GITHUB_TOKEN must be set before publishing.
  set "EXIT_CODE=1"
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

call %GIT_CMD% add package.json
if exist package-lock.json call %GIT_CMD% add package-lock.json
call %GIT_CMD% commit -m "release: v%NEW_VERSION%"
if errorlevel 1 (
  echo Git commit failed.
  set "EXIT_CODE=1"
  goto finish
)

call %GIT_CMD% tag "v%NEW_VERSION%"
if errorlevel 1 (
  echo Git tag creation failed.
  set "EXIT_CODE=1"
  goto finish
)

call %GIT_CMD% push origin "%CURRENT_BRANCH%"
if errorlevel 1 (
  echo Git push for branch %CURRENT_BRANCH% failed.
  set "EXIT_CODE=1"
  goto finish
)

call %GIT_CMD% push origin "v%NEW_VERSION%"
if errorlevel 1 (
  echo Git push for tag v%NEW_VERSION% failed.
  set "EXIT_CODE=1"
  goto finish
)

set "ALLOW_LOCAL_PUBLISH=1"
if not defined WIN_CSC_LINK if not defined CSC_LINK set "ALLOW_UNSIGNED_LOCAL_PUBLISH=1"
if not defined WIN_CSC_KEY_PASSWORD if not defined CSC_KEY_PASSWORD set "ALLOW_UNSIGNED_LOCAL_PUBLISH=1"

if defined ALLOW_UNSIGNED_LOCAL_PUBLISH (
  echo Publishing unsigned artifacts because signing secrets are not fully configured.
)

call %NPM_CMD% run dist:publish
if errorlevel 1 (
  echo Publish failed after creating release commit and tag.
  set "EXIT_CODE=1"
  goto finish
)

echo Published release v%NEW_VERSION%.

:finish
if "%PAUSE_ON_EXIT%"=="1" pause
exit /b %EXIT_CODE%