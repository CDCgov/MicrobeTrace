#!/bin/bash
# for MAC
set -x
# This script sets up the environment, builds an Angular application,
# and packages it into a deployable WAR file. Ensure Java and Node.js are installed.

echo "===> Checking Java version..."
java -version || { echo "Java not found in PATH"; exit 1; }

echo "===> Checking Node/NPM..."
node -v || { echo "Node.js not found"; exit 1; }
npm -v || { echo "npm not found"; exit 1; }

echo "===> Building Angular app..."
npm run build -- --configuration production --base-href=./ || { echo "Angular build failed"; exit 1; }
npm run verify:dist || { echo "Production artifact verification failed"; exit 1; }

echo "===> Creating WAR file..."
WAR_PATH="dist/Microbetrace.WAR"
WAR_TMP_PATH="dist/Microbetrace.tmp.WAR"
rm -f "$WAR_TMP_PATH"
cd dist/MicrobeTrace || { echo "dist/MicrobeTrace not found"; exit 1; }
jar -cvf "../$(basename "$WAR_TMP_PATH")" . || { echo "Failed to create WAR file"; exit 1; }
mv -f "../$(basename "$WAR_TMP_PATH")" "../$(basename "$WAR_PATH")" || { echo "Failed to replace WAR file"; exit 1; }

echo "===> WAR file created at $WAR_PATH"
