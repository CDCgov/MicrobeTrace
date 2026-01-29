#!/bin/bash
# Build script to create a WAR file for Tomcat deployment
# This script bundles assets, compresses files, and packages everything into a WAR file

set -e  # Exit on error

echo "=========================================="
echo "Building MicrobeTrace WAR file for Tomcat"
echo "=========================================="

# Check if Java/Maven is installed
echo "===> Checking Java/Maven..."
if ! command -v mvn &> /dev/null; then
    echo "ERROR: Maven not found. Please install Maven to build WAR files."
    exit 1
fi
mvn -version

# Check if Node.js/npm is installed
echo ""
echo "===> Checking Node.js/npm..."
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not found. Please install Node.js to bundle assets."
    exit 1
fi
node -v
npm -v

# Install npm dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo ""
    echo "===> Installing npm dependencies..."
    npm install
fi

# Bundle JavaScript and CSS assets
echo ""
echo "===> Bundling assets..."
npm run bundle

# Compress large files
echo ""
echo "===> Compressing files..."
npm run compress

# Build WAR file with Maven
echo ""
echo "===> Building WAR file with Maven..."
mvn clean package

# Check if WAR file was created
WAR_FILE="target/MicrobeTrace.war"
if [ -f "$WAR_FILE" ]; then
    echo ""
    echo "=========================================="
    echo "✓ WAR file created successfully!"
    echo "Location: $WAR_FILE"
    echo ""
    echo "To deploy to Tomcat:"
    echo "  1. Copy $WAR_FILE to your Tomcat webapps directory"
    echo "  2. Restart Tomcat"
    echo "  3. Access at: http://localhost:8080/MicrobeTrace/"
    echo "=========================================="
else
    echo ""
    echo "ERROR: WAR file was not created. Check the Maven output above for errors."
    exit 1
fi
