#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

SKIP_BUILD=false
WAR_PATH=""
CONTEXT="ROOT"
TOMCAT_VERSION="${TOMCAT_VERSION:-10.1.33}"
TOMCAT_SERVER_DIR="${TOMCAT_SERVER_DIR:-$REPO_ROOT/tomcat-server}"
TOMCAT_HOME="${TOMCAT_SERVER_DIR}/apache-tomcat-${TOMCAT_VERSION}"
TOMCAT_PORT="${TOMCAT_HTTP_PORT:-8080}"
LOG_FILE="${TOMCAT_HOME}/logs/catalina.out"

usage() {
  cat <<'EOF'
Usage: scripts/tomcat/run-war-smoke.sh [--skip-build] [--war /path/to/file.war] [--context ROOT]

Options:
  --skip-build       Do not run ./scripts/build-war.sh before deployment.
  --war PATH         Specify WAR to deploy.
  --context NAME     Deployment context (default: ROOT).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --war)
      WAR_PATH="${2:-}"
      if [ -z "$WAR_PATH" ]; then
        echo "Missing value for --war"
        exit 1
      fi
      shift 2
      ;;
    --context)
      CONTEXT="${2:-ROOT}"
      if [ -z "$CONTEXT" ]; then
        echo "Missing value for --context"
        exit 1
      fi
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

run_build_war() {
  if [ "$SKIP_BUILD" = true ]; then
    return 0
  fi

  case "$(uname -s)" in
    CYGWIN*|MINGW*|MSYS*)
      if command -v cmd >/dev/null 2>&1; then
        cmd //c "cd /d \"$REPO_ROOT\" && scripts\\build-war.cmd"
      else
        bash "$REPO_ROOT/scripts/build-war.sh"
      fi
      ;;
    *)
      bash "$REPO_ROOT/scripts/build-war.sh"
      ;;
  esac
}

if [ "$SKIP_BUILD" = false ]; then
  run_build_war
fi

bash "$SCRIPT_DIR/setup-local-tomcat.sh"
bash "$SCRIPT_DIR/deploy-war-local.sh" "$WAR_PATH" "$CONTEXT"
bash "$SCRIPT_DIR/start-local-tomcat.sh"

if ! [ -f "$LOG_FILE" ]; then
  echo "Startup log not found yet: $LOG_FILE"
  exit 1
fi

for _ in {1..60}; do
  if grep -q "Server startup in" "$LOG_FILE" 2>/dev/null; then
    break
  fi
  sleep 1
done

if ! grep -q "Server startup in" "$LOG_FILE" 2>/dev/null; then
  echo "Tomcat did not report startup completion in logs. Showing tail:"
  tail -n 40 "$LOG_FILE"
  exit 1
fi

url="http://localhost:${TOMCAT_PORT}/"

if command -v curl >/dev/null 2>&1; then
  if ! curl -fsS --max-time 20 "$url" >/dev/null; then
    echo "Smoke check failed: Tomcat responded unexpectedly at $url"
    exit 1
  fi
  echo "Smoke check passed. App available at $url"
else
  echo "curl not available; skipping HTTP smoke check. App should be available at $url"
fi
