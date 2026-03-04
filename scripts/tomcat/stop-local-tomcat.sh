#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

TOMCAT_VERSION="${TOMCAT_VERSION:-10.1.33}"
TOMCAT_SERVER_DIR="${TOMCAT_SERVER_DIR:-$REPO_ROOT/tomcat-server}"
TOMCAT_HOME="${TOMCAT_SERVER_DIR}/apache-tomcat-${TOMCAT_VERSION}"
CATALINA_PID_FILE="${TOMCAT_HOME}/tomcat-local.pid"

if [ ! -x "$TOMCAT_HOME/bin/shutdown.sh" ]; then
  echo "Tomcat shutdown script not found. Tomcat may not be configured."
  exit 1
fi

export CATALINA_HOME="$TOMCAT_HOME"
export CATALINA_BASE="$TOMCAT_HOME"
export CATALINA_PID="$CATALINA_PID_FILE"

if [ ! -f "$CATALINA_PID_FILE" ]; then
  echo "No local Tomcat PID file at $CATALINA_PID_FILE. Nothing to stop."
  exit 0
fi

pid="$(cat "$CATALINA_PID_FILE")"
if ! ps -p "$pid" >/dev/null 2>&1; then
  echo "PID file exists but process is not running: $pid"
  rm -f "$CATALINA_PID_FILE"
  exit 0
fi

"$TOMCAT_HOME/bin/shutdown.sh"

for _ in {1..20}; do
  if ! ps -p "$pid" >/dev/null 2>&1; then
    rm -f "$CATALINA_PID_FILE"
    echo "Tomcat stopped."
    exit 0
  fi
  sleep 1
done

echo "Tomcat did not stop gracefully. Forcing kill on PID $pid..."
kill -9 "$pid" || true
rm -f "$CATALINA_PID_FILE"
echo "Tomcat force-stopped."
