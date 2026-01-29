@echo off
REM Build script to create a WAR file for Tomcat deployment (Windows)
REM This script bundles assets, compresses files, and packages everything into a WAR file

echo ==========================================
echo Building MicrobeTrace WAR file for Tomcat
echo ==========================================

REM Check if Maven is installed
echo.
echo ===^> Checking Java/Maven...
where mvn >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Maven not found. Please install Maven to build WAR files.
    exit /b 1
)
mvn -version

REM Check if Node.js/npm is installed
echo.
echo ===^> Checking Node.js/npm...
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js not found. Please install Node.js to bundle assets.
    exit /b 1
)
node -v
npm -v

REM Install npm dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo.
    echo ===^> Installing npm dependencies...
    call npm install
)

REM Bundle JavaScript and CSS assets
echo.
echo ===^> Bundling assets...
call npm run bundle

REM Compress large files
echo.
echo ===^> Compressing files...
call npm run compress

REM Build WAR file with Maven
echo.
echo ===^> Building WAR file with Maven...
call mvn clean package

REM Check if WAR file was created
if exist "target\MicrobeTrace.war" (
    echo.
    echo ==========================================
    echo WAR file created successfully!
    echo Location: target\MicrobeTrace.war
    echo.
    echo To deploy to Tomcat:
    echo   1. Copy target\MicrobeTrace.war to your Tomcat webapps directory
    echo   2. Restart Tomcat
    echo   3. Access at: http://localhost:8080/MicrobeTrace/
    echo ==========================================
) else (
    echo.
    echo ERROR: WAR file was not created. Check the Maven output above for errors.
    exit /b 1
)
