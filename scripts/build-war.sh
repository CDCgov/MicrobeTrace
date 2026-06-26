#!/bin/bash
# for MAC
set -x
# This script sets up the environment, builds an Angular application,
# and packages it into a deployable WAR file.

echo "===> Checking Node/NPM..."
node -v || { echo "Node.js not found"; exit 1; }
npm -v || { echo "npm not found"; exit 1; }

echo "===> Building Angular app..."
npm run build -- --configuration production --base-href=./ || { echo "Angular build failed"; exit 1; }
npm run verify:dist || { echo "Production artifact verification failed"; exit 1; }

echo "===> Creating WAR file..."
APP_VERSION="$(node -p "require('./package.json').version")"
WAR_PATH="dist/MicrobeTrace_${APP_VERSION}.war"
WAR_TMP_PATH="dist/MicrobeTrace_${APP_VERSION}.tmp.war"
rm -f "$WAR_TMP_PATH"
cd dist/MicrobeTrace || { echo "dist/MicrobeTrace not found"; exit 1; }
if command -v jar >/dev/null 2>&1; then
  jar -cf "../$(basename "$WAR_TMP_PATH")" . || { echo "Failed to create WAR file"; exit 1; }
elif command -v zip >/dev/null 2>&1; then
  zip -qr "../$(basename "$WAR_TMP_PATH")" . || { echo "Failed to create WAR file"; exit 1; }
else
  echo "Neither jar nor zip was found in PATH; install a JDK or zip to package the WAR."
  exit 1
fi
mv -f "../$(basename "$WAR_TMP_PATH")" "../$(basename "$WAR_PATH")" || { echo "Failed to replace WAR file"; exit 1; }

echo "===> WAR file created at $WAR_PATH"
