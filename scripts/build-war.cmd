@REM This script sets up the environment, builds an Angular application, 
@REM and packages it into a deployable WAR file. Ensure Java and Node.js are installed 
@REM and properly configured before running.
@REM NOTE: 
@REM     To run the build in windows CLI:
@REM     build-war.cmd

CLS

@REM Add Java to PATH - Modify this path to your Java installation path
@REM This may not be necessary if Java is already added to PATH
SET PATH=C:\Program Files\Java\jdk-21\bin;%PATH%
SET WAR_PATH=dist\Microbetrace.WAR
SET WAR_TMP_PATH=dist\Microbetrace.tmp.WAR

@REM Build Angular application and create WAR file
@REM NPM and Java must be installed and added to PATH
@REM node --max-old-space-size=4096 ..\node_modules\@angular\cli\bin\ng build --configuration production --base-href=./ && ^
IF EXIST %WAR_TMP_PATH% DEL /F /Q %WAR_TMP_PATH%
npm run build -- --configuration production --base-href=./ && ^
npm run verify:dist && ^
java -version && ^
jar -cvf %WAR_TMP_PATH% -C dist\MicrobeTrace\ . && ^
move /Y %WAR_TMP_PATH% %WAR_PATH% >NUL && ^
echo WAR file created at %WAR_PATH%
