@REM This script sets up the environment, builds an Angular application,
@REM and packages it into a deployable WAR file. Ensure Node.js and npm are
@REM installed and properly configured before running.
@REM NOTE: 
@REM     To run the build in windows CLI:
@REM     build-war.cmd

CLS

for /f "usebackq delims=" %%v in (`node -p "require('./package.json').version"`) do set "APP_VERSION=%%v"
if "%APP_VERSION%"=="" (
  echo Unable to read package version from package.json.
  exit /b 1
)

SET "WAR_PATH=dist\MicrobeTrace_%APP_VERSION%.war"
SET "WAR_TMP_PATH=dist\MicrobeTrace_%APP_VERSION%.tmp.war"

@REM Build Angular application and create WAR file
@REM NPM must be installed and added to PATH.
@REM node --max-old-space-size=4096 ..\node_modules\@angular\cli\bin\ng build --configuration production --base-href=./ && ^
IF EXIST "%WAR_TMP_PATH%" DEL /F /Q "%WAR_TMP_PATH%"
call npm run build -- --configuration production --base-href=./
IF ERRORLEVEL 1 exit /b %ERRORLEVEL%

call npm run verify:dist
IF ERRORLEVEL 1 exit /b %ERRORLEVEL%

where jar >NUL 2>NUL
IF ERRORLEVEL 1 (
  powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\create-war-archive.ps1" -SourceDir "dist\MicrobeTrace" -DestinationPath "%WAR_TMP_PATH%"
) ELSE (
  jar -cf "%WAR_TMP_PATH%" -C dist\MicrobeTrace\ .
)
IF ERRORLEVEL 1 exit /b %ERRORLEVEL%

move /Y "%WAR_TMP_PATH%" "%WAR_PATH%" >NUL
IF ERRORLEVEL 1 exit /b %ERRORLEVEL%

echo WAR file created at %WAR_PATH%
