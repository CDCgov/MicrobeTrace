@REM This script sets up the environment, builds an Angular application, 
@REM and packages it into a deployable WAR file. Ensure Java and Node.js are installed 
@REM and properly configured before running.
@REM NOTE: 
@REM     To run the build in windows CLI:
@REM     build-war.cmd

CLS

@REM Add Java to PATH - Modify this path to your Java installation path
@REM This may not be necessary if Java is already added to PATH
SET PATH=C:\MyPrograms\Java\jdk-21.0.5\bin;%PATH%

@REM Build Angular application and create WAR file
@REM NPM and Java must be installed and added to PATH
npm run build -- --configuration production --optimization=false --base-href=./ && ^
java -version && ^
jar -cvf dist/MicrobeTrace.war -C dist/MicrobeTrace/ .
$commit = git rev-parse --short HEAD
mv dist/MicrobeTrace.war dist/MicrobeTrace_$commit.war