#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

TOMCAT_VERSION="${TOMCAT_VERSION:-10.1.33}"
TOMCAT_SERVER_DIR="${TOMCAT_SERVER_DIR:-$REPO_ROOT/tomcat-server}"
TOMCAT_HOME="${TOMCAT_SERVER_DIR}/apache-tomcat-${TOMCAT_VERSION}"
TOMCAT_ARCHIVE="$TOMCAT_SERVER_DIR/apache-tomcat-${TOMCAT_VERSION}.tar.gz"
TOMCAT_URL="https://archive.apache.org/dist/tomcat/tomcat-10/v${TOMCAT_VERSION}/bin/apache-tomcat-${TOMCAT_VERSION}.tar.gz"

mkdir -p "$TOMCAT_SERVER_DIR"

for command_name in curl tar; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command not found: $command_name"
    exit 1
  fi
done

if [ -x "$TOMCAT_HOME/bin/catalina.sh" ]; then
  echo "Tomcat ${TOMCAT_VERSION} already exists at:"
  echo "  $TOMCAT_HOME"
  mkdir -p "$TOMCAT_HOME/logs" "$TOMCAT_HOME/temp" "$TOMCAT_HOME/work" "$TOMCAT_HOME/webapps"
  exit 0
fi

if [ -d "$TOMCAT_HOME" ]; then
  rm -rf "$TOMCAT_HOME"
fi

if [ -f "$TOMCAT_ARCHIVE" ]; then
  rm -f "$TOMCAT_ARCHIVE"
fi

echo "Downloading Tomcat ${TOMCAT_VERSION}..."
curl -fL "$TOMCAT_URL" -o "$TOMCAT_ARCHIVE"

echo "Extracting Tomcat ${TOMCAT_VERSION}..."
tar -xzf "$TOMCAT_ARCHIVE" -C "$TOMCAT_SERVER_DIR"
rm -f "$TOMCAT_ARCHIVE"

if [ ! -x "$TOMCAT_HOME/bin/catalina.sh" ]; then
  echo "Tomcat extraction failed. Expected binary not found:"
  echo "  $TOMCAT_HOME/bin/catalina.sh"
  exit 1
fi

mkdir -p "$TOMCAT_HOME/logs" "$TOMCAT_HOME/temp" "$TOMCAT_HOME/work" "$TOMCAT_HOME/webapps"
rm -rf "$TOMCAT_HOME/webapps/ROOT" "$TOMCAT_HOME/webapps/ROOT.war"

echo "Tomcat setup complete at:"
echo "  $TOMCAT_HOME"
