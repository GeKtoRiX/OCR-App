#!/usr/bin/env bash
set -euo pipefail

# ─── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ─── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PID_FILE="${ROOT_DIR}/.app.pid"
ENV_FILE="${ROOT_DIR}/.env"

# ─── Load .env ─────────────────────────────────────────────────────────────────
if [[ -f "${ENV_FILE}" ]]; then
    # Export only KEY=VALUE lines, skip comments and blanks
    set -o allexport
    # shellcheck disable=SC1090
    source <(grep -E '^[A-Z_]+=\S' "${ENV_FILE}")
    set +o allexport
fi

# ─── Resolve config from env (with defaults) ───────────────────────────────────
APP_PORT="${PORT:-3000}"
LM_URL="${LM_STUDIO_BASE_URL:-http://localhost:1234/v1}"
PADDLE_HOST="${PADDLEOCR_HOST:-localhost}"
PADDLE_PORT="${PADDLEOCR_PORT:-8000}"

# ─── Helpers ───────────────────────────────────────────────────────────────────
header() {
    echo
    echo -e "${CYAN} ====================================${RESET}"
    echo -e "${CYAN}  ${1}${RESET}"
    echo -e "${CYAN} ====================================${RESET}"
    echo
}

check_env() {
    echo -e "${BOLD}Environment:${RESET}"
    echo "  APP_PORT         = ${APP_PORT}"
    echo "  LM_STUDIO_URL    = ${LM_URL}"
    echo "  PADDLEOCR_HOST   = ${PADDLE_HOST}"
    echo "  PADDLEOCR_PORT   = ${PADDLE_PORT}"
    [[ -n "${OPENAI_API_KEY:-}" ]] \
        && echo "  OPENAI_API_KEY   = (set)" \
        || echo -e "  OPENAI_API_KEY   = ${YELLOW}(not set — agentic endpoints disabled)${RESET}"
    echo
}

check_lm_studio() {
    local url="${LM_URL%/v1}/v1/models"
    echo -n "  LM Studio (${url})... "
    if curl -s --max-time 3 "${url}" &>/dev/null; then
        echo -e "${GREEN}OK${RESET}"
        return 0
    else
        echo -e "${YELLOW}unavailable${RESET}"
        return 1
    fi
}

check_paddleocr() {
    local url="http://${PADDLE_HOST}:${PADDLE_PORT}/health"
    echo -n "  PaddleOCR (${url})... "
    if curl -s --max-time 3 "${url}" &>/dev/null; then
        echo -e "${GREEN}OK${RESET}"
        return 0
    else
        echo -e "${YELLOW}unavailable${RESET}"
        return 1
    fi
}

# ─── Commands ──────────────────────────────────────────────────────────────────
cmd_status() {
    header "OCR-App  Status"
    check_env

    echo -e "${BOLD}Services:${RESET}"
    check_lm_studio || true
    check_paddleocr || true

    echo
    echo -e "${BOLD}Backend process:${RESET}"
    if [[ -f "${PID_FILE}" ]]; then
        PID=$(cat "${PID_FILE}")
        if kill -0 "${PID}" 2>/dev/null; then
            echo -e "  ${GREEN}Running${RESET} (PID ${PID})  →  http://localhost:${APP_PORT}"
        else
            echo -e "  ${RED}Stopped${RESET} (stale PID file)"
        fi
    else
        echo -e "  ${RED}Stopped${RESET}"
    fi

    echo
}

cmd_start() {
    header "OCR-App  Start"
    check_env

    # Already running?
    if [[ -f "${PID_FILE}" ]] && kill -0 "$(cat "${PID_FILE}")" 2>/dev/null; then
        echo -e "${YELLOW}  [!] App is already running (PID $(cat "${PID_FILE}")).${RESET}"
        echo "      URL: http://localhost:${APP_PORT}"
        echo
        exit 0
    fi

    echo -e "${BOLD}Checking services:${RESET}"
    if ! check_lm_studio; then
        echo "      Start LM Studio → Developer tab → Start Server."
        echo
        read -rp "  Continue anyway? (y/n): " REPLY
        [[ "${REPLY,,}" != "y" ]] && exit 0
    fi
    if ! check_paddleocr; then
        echo "      Start PaddleOCR sidecar before using OCR."
        echo
        read -rp "  Continue anyway? (y/n): " REPLY
        [[ "${REPLY,,}" != "y" ]] && exit 0
    fi

    echo
    cd "${ROOT_DIR}"

    if [[ -f "backend/dist/main.js" && -f "frontend/dist/index.html" ]]; then
        echo -e "  Build artifacts found — skipping build."
        echo -e "  ${YELLOW}(run wipe to force rebuild)${RESET}"
    else
        echo -e "  Building app..."
        echo
        npm run build
    fi

    echo
    echo -e "  Starting backend..."
    node backend/dist/main.js > /dev/null 2>&1 &
    APP_PID=$!
    echo "${APP_PID}" > "${PID_FILE}"
    echo "  PID: ${APP_PID}"

    echo
    echo -n "  Waiting for app to be ready"
    ATTEMPTS=0
    until curl -s --max-time 2 "http://localhost:${APP_PORT}/api/health" &>/dev/null; do
        ATTEMPTS=$((ATTEMPTS + 1))
        if [[ $ATTEMPTS -gt 30 ]]; then
            echo
            echo -e "${RED}  [!] App did not respond within 90 seconds.${RESET}"
            kill "${APP_PID}" 2>/dev/null || true
            rm -f "${PID_FILE}"
            exit 1
        fi
        echo -n "."
        sleep 3
    done

    echo
    echo
    echo -e "${GREEN}  App is ready!${RESET}"
    echo "    URL: http://localhost:${APP_PORT}"
    echo
    echo "  Stop:  $0 stop"
    echo "  Wipe:  $0 wipe"
    echo

    if command -v xdg-open &>/dev/null; then
        xdg-open "http://localhost:${APP_PORT}" &>/dev/null &
    elif command -v open &>/dev/null; then
        open "http://localhost:${APP_PORT}" &>/dev/null &
    fi
}

cmd_stop() {
    header "OCR-App  Stop"

    if [[ -f "${PID_FILE}" ]]; then
        PID=$(cat "${PID_FILE}")
        if kill -0 "${PID}" 2>/dev/null; then
            echo "  Stopping backend (PID ${PID})..."
            kill "${PID}"
            rm -f "${PID_FILE}"
            echo -e "${GREEN}  Stopped.${RESET}"
        else
            echo -e "${RED}  [!] Process ${PID} is not running.${RESET}"
            rm -f "${PID_FILE}"
        fi
    else
        echo "  No PID file — trying pkill..."
        if pkill -f "node backend/dist/main.js" 2>/dev/null; then
            echo -e "${GREEN}  Stopped.${RESET}"
        else
            echo -e "${RED}  [!] No running backend process found.${RESET}"
        fi
    fi
    echo
}

cmd_wipe() {
    header "OCR-App  Full Wipe"
    echo -e "${YELLOW}  [!] This will stop the app and remove all build artifacts.${RESET}"
    echo "      PaddleOCR sidecar files are not affected."
    echo
    read -rp "  Type 'wipe' to confirm: " CONFIRM
    if [[ "${CONFIRM}" != "wipe" ]]; then
        echo
        echo "  Cancelled."
        echo
        exit 0
    fi

    echo

    if [[ -f "${PID_FILE}" ]]; then
        PID=$(cat "${PID_FILE}")
        if kill -0 "${PID}" 2>/dev/null; then
            echo "  Stopping backend (PID ${PID})..."
            kill "${PID}"
        fi
        rm -f "${PID_FILE}"
    else
        pkill -f "node backend/dist/main.js" 2>/dev/null || true
    fi

    echo "  Removing build artifacts..."
    rm -rf "${ROOT_DIR}/backend/dist" \
           "${ROOT_DIR}/frontend/dist" \
           "${ROOT_DIR}/frontend/tsconfig.tsbuildinfo"

    echo
    echo -e "${GREEN}  Done. Run '$0 start' to rebuild and start.${RESET}"
    echo
}

# ─── Entrypoint ────────────────────────────────────────────────────────────────
case "${1:-}" in
    start)  cmd_start  ;;
    stop)   cmd_stop   ;;
    wipe)   cmd_wipe   ;;
    status) cmd_status ;;
    *)
        echo
        echo -e "  Usage: ${BOLD}$0 {start|stop|wipe|status}${RESET}"
        echo
        echo "    start   — check env & services, build if needed, start backend"
        echo "    stop    — stop the backend process"
        echo "    wipe    — stop + remove all build artifacts"
        echo "    status  — show env, service health and process state"
        echo
        exit 1
        ;;
esac
