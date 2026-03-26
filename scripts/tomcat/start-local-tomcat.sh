#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

TOMCAT_VERSION="${TOMCAT_VERSION:-10.1.33}"
TOMCAT_SERVER_DIR="${TOMCAT_SERVER_DIR:-$REPO_ROOT/tomcat-server}"
TOMCAT_HOME="${TOMCAT_SERVER_DIR}/apache-tomcat-${TOMCAT_VERSION}"
CATALINA_PID_FILE="${TOMCAT_HOME}/tomcat-local.pid"
TOMCAT_PORT="${TOMCAT_HTTP_PORT:-8080}"
TOMCAT_BASE_URL="http://localhost:${TOMCAT_PORT}"

if [ ! -x "$TOMCAT_HOME/bin/startup.sh" ]; then
  echo "Tomcat startup script not found. Run ./scripts/tomcat/setup-local-tomcat.sh first."
  exit 1
fi

if [ -f "$CATALINA_PID_FILE" ]; then
  existing_pid="$(cat "$CATALINA_PID_FILE")"
  if ps -p "$existing_pid" >/dev/null 2>&1; then
    echo "Tomcat already appears to be running (PID: $existing_pid)."
    echo "Visit $TOMCAT_BASE_URL/ to validate."
    exit 0
  fi
  rm -f "$CATALINA_PID_FILE"
fi

if command -v lsof >/dev/null 2>&1; then
  if lsof -tiTCP:"$TOMCAT_PORT" -sTCP:LISTEN -nP >/dev/null 2>&1; then
    echo "Port ${TOMCAT_PORT} is already in use. Stop the process or set TOMCAT_HTTP_PORT."
    exit 1
  fi
fi

export CATALINA_HOME="$TOMCAT_HOME"
export CATALINA_BASE="$TOMCAT_HOME"
export CATALINA_PID="$CATALINA_PID_FILE"
export CATALINA_TMPDIR="$TOMCAT_HOME/temp"
mkdir -p "$TOMCAT_HOME/logs" "$TOMCAT_HOME/temp" "$TOMCAT_HOME/work" "$TOMCAT_HOME/webapps"

"$TOMCAT_HOME/bin/startup.sh"

if [ -n "${CATALINA_PID_FILE:-}" ] && [ -f "$CATALINA_PID_FILE" ]; then
  echo "Tomcat started. PID: $(cat "$CATALINA_PID_FILE")"
else
  echo "Tomcat started. Check $TOMCAT_HOME/logs/catalina.out for status."
fi
echo "URL: $TOMCAT_BASE_URL/"
