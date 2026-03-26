#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

WAR_PATH="${1:-}"
CONTEXT="${2:-ROOT}"

if [[ "$CONTEXT" == *"/"* || "$CONTEXT" == *"\\"* ]]; then
  echo "Context name must not contain slashes."
  exit 1
fi

TOMCAT_VERSION="${TOMCAT_VERSION:-10.1.33}"
TOMCAT_SERVER_DIR="${TOMCAT_SERVER_DIR:-$REPO_ROOT/tomcat-server}"
TOMCAT_HOME="${TOMCAT_SERVER_DIR}/apache-tomcat-${TOMCAT_VERSION}"
WEBAPPS_DIR="${TOMCAT_HOME}/webapps"

if [ ! -d "$TOMCAT_HOME" ] || [ ! -x "$TOMCAT_HOME/bin/catalina.sh" ]; then
  echo "Tomcat is not set up. Run ./scripts/tomcat/setup-local-tomcat.sh first."
  exit 1
fi

if [ -z "$WAR_PATH" ]; then
  WAR_PATH="$(ls -1t "$REPO_ROOT/dist"/MicrobeTrace_*.war 2>/dev/null | head -n 1 || true)"
fi

if [ -z "${WAR_PATH}" ]; then
  echo "No WAR file found in dist/. Run ./scripts/build-war.sh first or pass a WAR path."
  exit 1
fi

if [ ! -f "$WAR_PATH" ]; then
  echo "WAR path does not exist: $WAR_PATH"
  exit 1
fi

mkdir -p "$WEBAPPS_DIR"

if [ "$CONTEXT" = "ROOT" ]; then
  TARGET_WAR="${WEBAPPS_DIR}/ROOT.war"
  TARGET_DIR="${WEBAPPS_DIR}/ROOT"
else
  TARGET_WAR="${WEBAPPS_DIR}/${CONTEXT}.war"
  TARGET_DIR="${WEBAPPS_DIR}/${CONTEXT}"
fi

rm -rf "$TARGET_DIR" "$TARGET_WAR"
cp "$WAR_PATH" "$TARGET_WAR"

echo "Deployed $WAR_PATH to $TARGET_WAR"
