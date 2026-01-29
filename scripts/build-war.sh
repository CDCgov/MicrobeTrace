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
npm run build -- --configuration production --optimization=false --base-href=./ || { echo "Angular build failed"; exit 1; }

echo "===> Creating WAR file..."
cd dist/MicrobeTrace/browser || { echo "dist/MicrobeTrace/browser not found"; exit 1; }
jar -cvf ../MicrobeTrace.war . || { echo "Failed to create WAR file"; exit 1; }

COMMIT=$(git rev-parse --short HEAD)

mv ../MicrobeTrace.war ../MicrobeTrace_${COMMIT}.war

echo "===> WAR file created at dist/MicrobeTrace_${COMMIT}.war"
