@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "POWERSHELL_SCRIPT=%~dp0run-war-smoke.ps1"
set "PS_ARGS="

:parse
if "%~1"=="" goto run

if /I "%~1"=="--skip-build" (
  set "PS_ARGS=%PS_ARGS% -SkipBuild"
  shift
  goto parse
)

if /I "%~1"=="--war" (
  if "%~2"=="" (
    echo Missing value for --war
    exit /b 1
  )
  set "PS_ARGS=%PS_ARGS% -War \"%~2\""
  shift
  shift
  goto parse
)

if /I "%~1"=="--context" (
  if "%~2"=="" (
    echo Missing value for --context
    exit /b 1
  )
  set "PS_ARGS=%PS_ARGS% -Context \"%~2\""
  shift
  shift
  goto parse
)

if /I "%~1"=="-h" (
  set "PS_ARGS=%PS_ARGS% -Help"
  shift
  goto parse
)

if /I "%~1"=="--help" (
  set "PS_ARGS=%PS_ARGS% -Help"
  shift
  goto parse
)

echo Unknown argument: %~1
echo Usage: run-war-smoke.cmd [--skip-build] [--war path] [--context ROOT] [--help]
exit /b 1

:run
powershell -NoProfile -ExecutionPolicy Bypass -File "%POWERSHELL_SCRIPT%" %PS_ARGS%
exit /b %ERRORLEVEL%
