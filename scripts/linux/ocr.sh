#!/usr/bin/env bash
# OCR App — unified launcher
#
#  ./ocr.sh                — choose a mode interactively, start services, show live status
#  ./ocr.sh start          — same as above
#  ./ocr.sh start ocr      — start OCR mode (PaddleOCR + LM Studio + backend)
#  ./ocr.sh start tts      — start TTS mode (PaddleOCR + Supertone + Kokoro + Qwen TTS + backend)
#  ./ocr.sh start all      — start all services (OCR + TTS + LM Studio model)
#  ./ocr.sh stop            — stop all known project services and clear ports
#  ./ocr.sh status          — show current mode, health and process state
#  ./ocr.sh wipe            — stop everything + remove build artifacts
#
#  Ctrl+C while running → aggressive shutdown of all known project services

set -euo pipefail

# ─── Colors & symbols ──────────────────────────────────────────────────────────
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

LAMP_BLUE='🔵'
LAMP_GREEN='🟢'
LAMP_YELLOW='🟡'
LAMP_RED='🔴'

# ─── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

PADDLE_VENV="${ROOT_DIR}/services/ocr/paddleocr-service/.venv"
SUPERTONE_VENV="${ROOT_DIR}/services/tts/supertone-service/.venv"
KOKORO_VENV="${ROOT_DIR}/services/tts/kokoro-service/.venv"
QWEN_VENV="${ROOT_DIR}/services/tts/qwen-service/.venv"

SUPERTONE_TORCH_LIB="${SUPERTONE_VENV}/lib/python3.12/site-packages/torch/lib"
KOKORO_TORCH_LIB="${KOKORO_VENV}/lib/python3.12/site-packages/torch/lib"
QWEN_TORCH_LIB="${QWEN_VENV}/lib/python3.12/site-packages/torch/lib"
TORCH_LIB_SYSTEM="/home/cbandy/.local/lib/python3.12/site-packages/torch/lib"

PID_DIR="${ROOT_DIR}/.pids"
PID_PADDLE="${PID_DIR}/paddleocr.pid"
PID_SUPERTONE="${PID_DIR}/supertone.pid"
PID_KOKORO="${PID_DIR}/kokoro.pid"
PID_QWEN="${PID_DIR}/qwen.pid"
PID_BACKEND="${PID_DIR}/backend.pid"
STATE_FILE="${PID_DIR}/ocr-menu.state"

LOG_DIR="${ROOT_DIR}/logs"
LOG_PADDLE="${LOG_DIR}/paddleocr.log"
LOG_SUPERTONE="${LOG_DIR}/supertone.log"
LOG_KOKORO="${LOG_DIR}/kokoro.log"
LOG_QWEN="${LOG_DIR}/qwen.log"
LOG_BACKEND="${LOG_DIR}/backend.log"
LOG_LM="${LOG_DIR}/lmstudio.log"

ENV_FILE="${ROOT_DIR}/.env"

# ─── Load .env ─────────────────────────────────────────────────────────────────
if [[ -f "${ENV_FILE}" ]]; then
    set -o allexport
    # shellcheck disable=SC1090
    source <(grep -E '^[A-Z_]+=\S' "${ENV_FILE}")
    set +o allexport
fi

# ─── Resolve config ─────────────────────────────────────────────────────────────
APP_PORT="${PORT:-3000}"
LM_URL="${LM_STUDIO_BASE_URL:-http://localhost:1234/v1}"
LM_BASE_URL="${LM_URL%/v1}"
LM_MODEL_ID="${STRUCTURING_MODEL:-qwen/qwen3.5-9b}"
LM_CLI_BIN="${LM_CLI_BIN:-${HOME}/.lmstudio/bin/lms}"

PADDLE_HOST="${PADDLEOCR_HOST:-localhost}"
PADDLE_PORT="${PADDLEOCR_PORT:-8000}"

SUPERTONE_HOST_CFG="${SUPERTONE_HOST:-localhost}"
SUPERTONE_PORT_CFG="${SUPERTONE_PORT:-8100}"

KOKORO_HOST_CFG="${KOKORO_HOST:-localhost}"
KOKORO_PORT_CFG="${KOKORO_PORT:-8200}"

QWEN_HOST_CFG="${QWEN_TTS_HOST:-localhost}"
QWEN_PORT_CFG="${QWEN_TTS_PORT:-8300}"

VITE_PORT="${VITE_PORT:-5173}"
PROJECT_PORTS=(3000 5173 8000 8100 8200 8300)

ACTIVE_MODE=""
ACTIVE_MODE_LABEL=""
LM_STARTED_BY_MENU=0
LM_MODEL_LOADED_BY_MENU=0

# ─── Helpers ───────────────────────────────────────────────────────────────────
header() {
    echo
    echo -e "${CYAN}╔══════════════════════════════════════╗${RESET}"
    printf "${CYAN}║  %-36s  ║${RESET}\n" "${1}"
    echo -e "${CYAN}╚══════════════════════════════════════╝${RESET}"
    echo
}

log()  { echo -e "  ${1}"; }
ok()   { echo -e "  ${GREEN}✓${RESET}  ${1}"; }
warn() { echo -e "  ${YELLOW}⚠${RESET}  ${1}"; }
fail() { echo -e "  ${RED}✗${RESET}  ${1}"; }
dim()  { echo -e "${DIM}  ${1}${RESET}"; }

ensure_dirs() {
    mkdir -p "${PID_DIR}" "${LOG_DIR}"
}

resolve_torch_lib() {
    local preferred="${1:-}"
    if [[ -n "${preferred}" && -d "${preferred}" ]]; then
        echo "${preferred}"
    elif [[ -d "${TORCH_LIB_SYSTEM}" ]]; then
        echo "${TORCH_LIB_SYSTEM}"
    else
        echo ""
    fi
}

format_gib() {
    awk -v bytes="${1}" 'BEGIN { printf "%.2f GiB", bytes / 1073741824 }'
}

mode_includes_lm() {
    [[ "${ACTIVE_MODE}" == "ocr" || "${ACTIVE_MODE}" == "all" ]]
}

mode_includes_tts() {
    [[ "${ACTIVE_MODE}" == "tts" || "${ACTIVE_MODE}" == "all" ]]
}

write_state() {
    cat > "${STATE_FILE}" <<EOF
ACTIVE_MODE=${ACTIVE_MODE}
ACTIVE_MODE_LABEL=${ACTIVE_MODE_LABEL}
LM_STARTED_BY_MENU=${LM_STARTED_BY_MENU}
LM_MODEL_LOADED_BY_MENU=${LM_MODEL_LOADED_BY_MENU}
EOF
}

read_state() {
    ACTIVE_MODE=""
    ACTIVE_MODE_LABEL=""
    LM_STARTED_BY_MENU=0
    LM_MODEL_LOADED_BY_MENU=0

    if [[ -f "${STATE_FILE}" ]]; then
        # shellcheck disable=SC1090
        source "${STATE_FILE}"
    fi
}

remove_state() {
    rm -f "${STATE_FILE}"
}

lms_cli_available() {
    [[ -x "${LM_CLI_BIN}" ]] || command -v lms >/dev/null 2>&1
}

lms_cmd() {
    local cli="${LM_CLI_BIN}"
    if [[ ! -x "${cli}" ]]; then
        cli="$(command -v lms)"
    fi

    env -u ELECTRON_RUN_AS_NODE PATH="$(dirname "${cli}"):${PATH}" "${cli}" "$@"
}

# ─── Process management ────────────────────────────────────────────────────────
is_running() {
    local pid_file="${1}"
    [[ -f "${pid_file}" ]] && kill -0 "$(cat "${pid_file}")" 2>/dev/null
}

kill_pid_quiet() {
    local pid="${1:-}"
    local i=0

    [[ -n "${pid}" ]] || return 0
    kill -0 "${pid}" 2>/dev/null || return 0

    kill "${pid}" 2>/dev/null || true
    while kill -0 "${pid}" 2>/dev/null && [[ ${i} -lt 10 ]]; do
        sleep 0.3
        i=$((i + 1))
    done
    kill -9 "${pid}" 2>/dev/null || true
}

stop_service() {
    local name="${1}" pid_file="${2}"
    if is_running "${pid_file}"; then
        local pid
        pid=$(cat "${pid_file}")
        kill_pid_quiet "${pid}"
        rm -f "${pid_file}"
        ok "Stopped ${name} (PID ${pid})"
    elif [[ -f "${pid_file}" ]]; then
        rm -f "${pid_file}"
        warn "${name}: stale PID file removed"
    else
        dim "${name}: not running"
    fi
}

kill_by_pattern() {
    local name="${1}" pattern="${2}"
    local matched=0
    local pid

    while IFS= read -r pid; do
        [[ -n "${pid}" ]] || continue
        [[ "${pid}" == "$$" || "${pid}" == "${PPID}" ]] && continue
        kill_pid_quiet "${pid}"
        matched=1
    done < <(pgrep -f -- "${pattern}" 2>/dev/null | sort -u || true)

    if [[ ${matched} -eq 1 ]]; then
        ok "Stopped ${name} by signature"
    else
        dim "${name}: no matching process"
    fi
}

find_listener_pids() {
    local port="${1}"
    if command -v lsof >/dev/null 2>&1; then
        lsof -tiTCP:"${port}" -sTCP:LISTEN -n -P 2>/dev/null || true
        return
    fi
    if command -v fuser >/dev/null 2>&1; then
        fuser -n tcp "${port}" 2>/dev/null | tr ' ' '\n' | sed '/^$/d' || true
    fi
}

port_has_listener() {
    local port="${1}"
    find_listener_pids "${port}" | grep -q '.'
}

clear_port() {
    local port="${1}"
    local pids=()
    local pid

    mapfile -t pids < <(find_listener_pids "${port}" | sort -u)

    if [[ ${#pids[@]} -eq 0 ]]; then
        dim "Port ${port}: clear"
        return
    fi

    for pid in "${pids[@]}"; do
        [[ -n "${pid}" ]] || continue
        [[ "${pid}" == "$$" || "${pid}" == "${PPID}" ]] && continue
        kill_pid_quiet "${pid}"
    done

    if port_has_listener "${port}"; then
        warn "Port ${port}: listener still present"
    else
        ok "Cleared port ${port}"
    fi
}

stop_lm_resources() {
    if ! lms_cli_available; then
        dim "LM Studio CLI not found for graceful shutdown"
        return
    fi

    if check_lm_model_loaded; then
        log "Unloading LM Studio model (${LM_MODEL_ID})..."
        lms_cmd unload "${LM_MODEL_ID}" >> "${LOG_LM}" 2>&1 || true
    fi
}

kill_known_project_processes() {
    kill_by_pattern "PaddleOCR" "${ROOT_DIR}/services/ocr/paddleocr-service"
    kill_by_pattern "PaddleOCR" "services/ocr/paddleocr-service"
    kill_by_pattern "Supertone" "${ROOT_DIR}/services/tts/supertone-service"
    kill_by_pattern "Supertone" "services/tts/supertone-service"
    kill_by_pattern "Kokoro" "${ROOT_DIR}/services/tts/kokoro-service"
    kill_by_pattern "Kokoro" "services/tts/kokoro-service"
    kill_by_pattern "Qwen TTS" "${ROOT_DIR}/services/tts/qwen-service"
    kill_by_pattern "Qwen TTS" "services/tts/qwen-service"
    kill_by_pattern "Backend" "${ROOT_DIR}/backend/dist/main.js"
    kill_by_pattern "Frontend Vite" "${ROOT_DIR}/node_modules/.bin/vite"
    kill_by_pattern "Frontend Vite" "${ROOT_DIR}/node_modules/vite"
    kill_by_pattern "Frontend Vite" "node_modules/.bin/vite"
    kill_by_pattern "Frontend Vite" "npm run dev --workspace=frontend"
}

global_cleanup() {
    stop_service "Backend" "${PID_BACKEND}"
    stop_service "Qwen TTS" "${PID_QWEN}"
    stop_service "Kokoro" "${PID_KOKORO}"
    stop_service "Supertone" "${PID_SUPERTONE}"
    stop_service "PaddleOCR" "${PID_PADDLE}"

    stop_lm_resources
    kill_known_project_processes

    log "Clearing project ports..."
    for port in "${PROJECT_PORTS[@]}"; do
        clear_port "${port}"
    done

    remove_state
}

# ─── Ctrl+C handler ────────────────────────────────────────────────────────────
cleanup() {
    trap - INT TERM
    echo
    echo
    header "Shutting down"
    global_cleanup
    echo
    ok "All known project services stopped."
    echo
    exit 0
}

startup_failed() {
    local message="${1}"
    echo
    fail "${message}"
    if [[ "${ACTIVE_MODE}" == "all" ]]; then
        warn "Start mode 1 (OCR) or mode 2 (TTS) instead."
    fi
    echo
    header "Rolling back"
    global_cleanup
    echo
    exit 1
}

# ─── Health probe helpers ──────────────────────────────────────────────────────
probe_url() {
    curl -sf --max-time 3 "${1}" &>/dev/null
}

probe_json() {
    curl -sf --max-time 3 "${1}" 2>/dev/null
}

check_lm_studio() {
    probe_url "${LM_BASE_URL}/v1/models"
}

check_lm_model_loaded() {
    if lms_cli_available; then
        local output
        output=$(lms_cmd ps 2>/dev/null || true)
        echo "${output}" | python3 -c 'import sys; target=sys.argv[1]; lines=[line.strip() for line in sys.stdin if line.strip()]; raise SystemExit(0 if any(line == target or line.startswith(target + " ") for line in lines) else 1)' "${LM_MODEL_ID}"
        return
    fi

    local json
    json=$(probe_json "${LM_BASE_URL}/v1/models") || return 1
    echo "${json}" | python3 -c 'import json,sys; target=sys.argv[1]; data=json.load(sys.stdin).get("data", []); raise SystemExit(0 if any((item.get("id") or item.get("model") or "") == target for item in data) else 1)' "${LM_MODEL_ID}"
}

check_paddle() {
    probe_url "http://${PADDLE_HOST}:${PADDLE_PORT}/health"
}

fetch_paddle_device() {
    local json
    json=$(probe_json "http://${PADDLE_HOST}:${PADDLE_PORT}/health") || return 1
    echo "${json}" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("device", "unknown"))'
}

check_supertone() {
    probe_url "http://${SUPERTONE_HOST_CFG}:${SUPERTONE_PORT_CFG}/health"
}

check_kokoro() {
    probe_url "http://${KOKORO_HOST_CFG}:${KOKORO_PORT_CFG}/health"
}

fetch_kokoro_device() {
    local json
    json=$(probe_json "http://${KOKORO_HOST_CFG}:${KOKORO_PORT_CFG}/health") || return 1
    echo "${json}" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("device", "unknown"))'
}

check_qwen() {
    local json
    json=$(probe_json "http://${QWEN_HOST_CFG}:${QWEN_PORT_CFG}/health") || return 1
    echo "${json}" | python3 -c 'import json,sys; d=json.load(sys.stdin); raise SystemExit(0 if d.get("ready") is True and d.get("device") == "gpu" else 1)'
}

fetch_qwen_device() {
    local json
    json=$(probe_json "http://${QWEN_HOST_CFG}:${QWEN_PORT_CFG}/health") || return 1
    echo "${json}" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("device", "unknown"))'
}

check_backend() {
    local code
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://localhost:${APP_PORT}/api/health" || true)
    [[ "${code}" == "200" || "${code}" == "503" ]]
}

wait_for_check() {
    local label="${1}" timeout="${2}" check_fn="${3}"
    local i=0

    echo -n "  Waiting for ${label}"
    until "${check_fn}" || [[ ${i} -ge ${timeout} ]]; do
        echo -n "."
        sleep 1
        i=$((i + 1))
    done
    echo

    "${check_fn}"
}

# ─── Mode selection ────────────────────────────────────────────────────────────
select_mode() {
    header "OCR App — Start"
    echo "  1  OCR"
    echo "     PaddleOCR + LM Studio + ${LM_MODEL_ID} + backend"
    echo
    echo "  2  TTS"
    echo "     PaddleOCR + Supertone + Kokoro + Qwen TTS + backend"
    echo
    echo "  3  All"
    echo "     OCR + TTS + LM Studio model"
    echo

    while true; do
        read -rp "  Select mode [1-3]: " choice
        case "${choice}" in
            1)
                ACTIVE_MODE="ocr"
                ACTIVE_MODE_LABEL="OCR"
                break
                ;;
            2)
                ACTIVE_MODE="tts"
                ACTIVE_MODE_LABEL="TTS"
                break
                ;;
            3)
                ACTIVE_MODE="all"
                ACTIVE_MODE_LABEL="ALL"
                break
                ;;
            *)
                warn "Invalid selection. Enter 1, 2 or 3."
                ;;
        esac
    done

    write_state
}

set_mode() {
    local mode="${1}"
    case "${mode}" in
        ocr)
            ACTIVE_MODE="ocr"
            ACTIVE_MODE_LABEL="OCR"
            ;;
        tts)
            ACTIVE_MODE="tts"
            ACTIVE_MODE_LABEL="TTS"
            ;;
        all)
            ACTIVE_MODE="all"
            ACTIVE_MODE_LABEL="ALL"
            ;;
        *)
            fail "Unknown mode: ${mode}"
            echo "  Valid modes: ocr, tts, all"
            exit 1
            ;;
    esac
    write_state
}

# ─── VRAM guard ────────────────────────────────────────────────────────────────
get_vram_stats() {
    local best_total=0
    local best_used=0
    local best_device=""
    local device total_file used_file total used

    for device in /sys/class/drm/card*/device; do
        total_file="${device}/mem_info_vram_total"
        used_file="${device}/mem_info_vram_used"
        [[ -r "${total_file}" && -r "${used_file}" ]] || continue

        total=$(<"${total_file}")
        used=$(<"${used_file}")

        [[ "${total}" =~ ^[0-9]+$ && "${used}" =~ ^[0-9]+$ ]] || continue

        if (( total > best_total )); then
            best_total="${total}"
            best_used="${used}"
            best_device="${device}"
        fi
    done

    (( best_total > 0 )) || return 1
    echo "${best_total} ${best_used} $((best_total - best_used)) ${best_device}"
}

check_vram_guard() {
    local threshold=$((4 * 1024 * 1024 * 1024))
    local stats total used free device

    log "Checking VRAM before mode 3..."
    if ! stats=$(get_vram_stats); then
        fail "VRAM counters are unavailable. Mode 3 cannot start safely."
        warn "Start mode 1 (OCR) or mode 2 (TTS) instead."
        return 1
    fi

    read -r total used free device <<< "${stats}"
    dim "Card         : ${device}"
    dim "VRAM total   : $(format_gib "${total}")"
    dim "VRAM used    : $(format_gib "${used}")"
    dim "VRAM free    : $(format_gib "${free}")"

    if (( free < threshold )); then
        fail "Mode 3 requires at least 4.00 GiB free VRAM before startup."
        warn "Start mode 1 (OCR) or mode 2 (TTS) instead."
        return 1
    fi

    ok "VRAM precheck passed"
}

# ─── Startup helpers ───────────────────────────────────────────────────────────
start_paddleocr() {
    if check_paddle; then
        ok "PaddleOCR already reachable"
        return 0
    fi

    if is_running "${PID_PADDLE}"; then
        ok "PaddleOCR already running (PID $(cat "${PID_PADDLE}"))"
        return 0
    fi

    if [[ ! -f "${PADDLE_VENV}/bin/python" ]]; then
        warn "PaddleOCR venv not found at ${PADDLE_VENV}"
        warn "Run: cd services/ocr/paddleocr-service && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
        return 1
    fi

    log "Starting PaddleOCR sidecar (port ${PADDLE_PORT})..."
    "${PADDLE_VENV}/bin/python" -m uvicorn \
        --app-dir "${ROOT_DIR}/services/ocr/paddleocr-service" main:app \
        --host 0.0.0.0 --port "${PADDLE_PORT}" \
        > "${LOG_PADDLE}" 2>&1 &
    echo $! > "${PID_PADDLE}"

    if wait_for_check "PaddleOCR" 30 check_paddle; then
        ok "PaddleOCR ready (PID $(cat "${PID_PADDLE}"))"
        return 0
    fi

    warn "PaddleOCR did not respond — check ${LOG_PADDLE}"
    return 1
}

start_supertone() {
    local torch_lib

    if check_supertone; then
        ok "Supertone already reachable"
        return 0
    fi

    if is_running "${PID_SUPERTONE}"; then
        ok "Supertone already running (PID $(cat "${PID_SUPERTONE}"))"
        return 0
    fi

    if [[ ! -f "${SUPERTONE_VENV}/bin/python" ]]; then
        warn "Supertone venv not found at ${SUPERTONE_VENV}"
        warn "Run: cd services/tts/supertone-service && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
        return 1
    fi

    torch_lib=$(resolve_torch_lib "${SUPERTONE_TORCH_LIB}")

    log "Starting Supertone TTS sidecar (port ${SUPERTONE_PORT_CFG})..."
    env SUPERTONE_USE_GPU=true \
        LD_LIBRARY_PATH="${torch_lib}:${LD_LIBRARY_PATH:-}" \
        "${SUPERTONE_VENV}/bin/python" -m uvicorn \
        --app-dir "${ROOT_DIR}/services/tts/supertone-service" main:app \
        --host 0.0.0.0 --port "${SUPERTONE_PORT_CFG}" \
        > "${LOG_SUPERTONE}" 2>&1 &
    echo $! > "${PID_SUPERTONE}"

    if wait_for_check "Supertone (model may download on first run)" 60 check_supertone; then
        ok "Supertone ready (PID $(cat "${PID_SUPERTONE}"))"
        return 0
    fi

    warn "Supertone did not respond — check ${LOG_SUPERTONE}"
    return 1
}

start_kokoro() {
    local torch_lib

    if check_kokoro; then
        ok "Kokoro already reachable"
        return 0
    fi

    if is_running "${PID_KOKORO}"; then
        ok "Kokoro already running (PID $(cat "${PID_KOKORO}"))"
        return 0
    fi

    if [[ ! -f "${KOKORO_VENV}/bin/python" ]]; then
        warn "Kokoro venv not found at ${KOKORO_VENV}"
        warn "Run: cd services/tts/kokoro-service && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
        return 1
    fi

    torch_lib=$(resolve_torch_lib "${KOKORO_TORCH_LIB}")

    log "Starting Kokoro TTS sidecar (port ${KOKORO_PORT_CFG})..."
    env KOKORO_USE_GPU=true \
        HSA_OVERRIDE_GFX_VERSION="${HSA_OVERRIDE_GFX_VERSION:-11.0.0}" \
        LD_LIBRARY_PATH="${torch_lib}:${LD_LIBRARY_PATH:-}" \
        "${KOKORO_VENV}/bin/python" -m uvicorn \
        --app-dir "${ROOT_DIR}/services/tts/kokoro-service" main:app \
        --host 0.0.0.0 --port "${KOKORO_PORT_CFG}" \
        > "${LOG_KOKORO}" 2>&1 &
    echo $! > "${PID_KOKORO}"

    if wait_for_check "Kokoro" 120 check_kokoro; then
        ok "Kokoro ready (PID $(cat "${PID_KOKORO}"))"
        return 0
    fi

    warn "Kokoro did not respond — check ${LOG_KOKORO}"
    return 1
}

start_qwen() {
    local torch_lib

    if check_qwen; then
        ok "Qwen TTS already reachable on GPU"
        return 0
    fi

    if is_running "${PID_QWEN}"; then
        ok "Qwen TTS already running (PID $(cat "${PID_QWEN}"))"
        return 0
    fi

    if [[ ! -f "${QWEN_VENV}/bin/python" ]]; then
        warn "Qwen TTS venv not found at ${QWEN_VENV}"
        warn "Run: cd services/tts/qwen-service && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
        return 1
    fi

    torch_lib=$(resolve_torch_lib "${QWEN_TORCH_LIB}")

    log "Starting Qwen TTS sidecar (port ${QWEN_PORT_CFG})..."
    env QWEN_TTS_REQUIRE_GPU=true \
        QWEN_TTS_HSA_OVERRIDE_GFX_VERSION="${QWEN_TTS_HSA_OVERRIDE_GFX_VERSION:-11.0.0}" \
        QWEN_TTS_ATTN_IMPLEMENTATION="${QWEN_TTS_ATTN_IMPLEMENTATION:-eager}" \
        LD_LIBRARY_PATH="${torch_lib}:${LD_LIBRARY_PATH:-}" \
        "${QWEN_VENV}/bin/python" -m uvicorn \
        --app-dir "${ROOT_DIR}/services/tts/qwen-service" main:app \
        --host 0.0.0.0 --port "${QWEN_PORT_CFG}" \
        > "${LOG_QWEN}" 2>&1 &
    echo $! > "${PID_QWEN}"

    if wait_for_check "Qwen TTS (model may download on first run)" 180 check_qwen; then
        ok "Qwen TTS ready on GPU (PID $(cat "${PID_QWEN}"))"
        return 0
    fi

    warn "Qwen TTS did not become GPU-ready — check ${LOG_QWEN}"
    return 1
}

start_lm_studio_server() {
    if check_lm_studio; then
        ok "LM Studio server reachable"
        return 0
    fi

    if ! lms_cli_available; then
        warn "LM Studio CLI not found"
        warn "Expected CLI at ${LM_CLI_BIN}"
        return 1
    fi

    log "Starting LM Studio server..."
    lms_cmd server start >> "${LOG_LM}" 2>&1 || return 1
    LM_STARTED_BY_MENU=1
    write_state

    if wait_for_check "LM Studio server" 30 check_lm_studio; then
        ok "LM Studio server ready"
        return 0
    fi

    warn "LM Studio server did not respond — check ${LOG_LM}"
    return 1
}

load_lm_model() {
    if check_lm_model_loaded; then
        ok "LM Studio model loaded (${LM_MODEL_ID})"
        return 0
    fi

    if ! lms_cli_available; then
        warn "LM Studio CLI not found"
        return 1
    fi

    log "Loading LM Studio model (${LM_MODEL_ID})..."
    lms_cmd load "${LM_MODEL_ID}" --gpu max -y >> "${LOG_LM}" 2>&1 || return 1
    LM_MODEL_LOADED_BY_MENU=1
    write_state

    if wait_for_check "LM Studio model" 60 check_lm_model_loaded; then
        ok "LM Studio model ready (${LM_MODEL_ID})"
        return 0
    fi

    warn "LM Studio model did not appear in /v1/models — check ${LOG_LM}"
    return 1
}

start_backend() {
    if check_backend; then
        ok "Backend already reachable"
        return 0
    fi

    if is_running "${PID_BACKEND}"; then
        ok "Backend already running (PID $(cat "${PID_BACKEND}"))"
        return 0
    fi

    cd "${ROOT_DIR}"

    if [[ -f "backend/dist/main.js" && -f "frontend/dist/index.html" ]]; then
        dim "Build artifacts found — skipping build."
    else
        log "Building app (frontend + backend)..."
        npm run build
        echo
    fi

    log "Starting NestJS backend (port ${APP_PORT})..."
    node backend/dist/main.js > "${LOG_BACKEND}" 2>&1 &
    echo $! > "${PID_BACKEND}"

    if wait_for_check "backend" 30 check_backend; then
        ok "Backend ready (PID $(cat "${PID_BACKEND}"))  →  http://localhost:${APP_PORT}"
        return 0
    fi

    warn "Backend did not respond — check ${LOG_BACKEND}"
    return 1
}

# ─── Status helpers ────────────────────────────────────────────────────────────
show_process_state() {
    local name="${1}" pid_file="${2}" port="${3}"
    if is_running "${pid_file}"; then
        ok "${name} running (PID $(cat "${pid_file}"))"
    elif port_has_listener "${port}"; then
        warn "${name} listening on ${port} without tracked PID"
    else
        fail "${name} stopped"
    fi
}

compute_mode_lamp() {
    local mode="${1:-${ACTIVE_MODE:-all}}"
    local paddle_ok=0
    local paddle_gpu=0
    local lm_ok=0
    local supertone_ok=0
    local kokoro_ok=0
    local qwen_ok=0
    local backend_ok=0
    local paddle_device="unknown"

    if check_paddle; then
        paddle_ok=1
        paddle_device=$(fetch_paddle_device 2>/dev/null || echo "unknown")
        [[ "${paddle_device}" == "gpu" ]] && paddle_gpu=1
    fi

    check_backend   && backend_ok=1 || true
    check_supertone && supertone_ok=1 || true
    check_kokoro    && kokoro_ok=1 || true
    check_qwen      && qwen_ok=1 || true
    check_lm_model_loaded && lm_ok=1 || true

    if [[ ${paddle_ok} -eq 0 ]]; then
        echo "${LAMP_RED}  PaddleOCR unreachable"
        return
    fi

    case "${mode}" in
        ocr)
            if [[ ${backend_ok} -eq 1 && ${lm_ok} -eq 1 && ${paddle_gpu} -eq 1 ]]; then
                echo "${LAMP_BLUE}  OCR mode ready | PaddleOCR GPU ✓ | LM Studio ✓ | Backend ✓"
            elif [[ ${backend_ok} -eq 1 && ${lm_ok} -eq 1 ]]; then
                echo "${LAMP_YELLOW}  OCR mode ready | PaddleOCR ${paddle_device} | LM Studio ✓ | Backend ✓"
            else
                echo "${LAMP_GREEN}  OCR mode partial | PaddleOCR ${paddle_device} | LM Studio $( [[ ${lm_ok} -eq 1 ]] && echo ✓ || echo ✗ ) | Backend $( [[ ${backend_ok} -eq 1 ]] && echo ✓ || echo ✗ )"
            fi
            ;;
        tts)
            if [[ ${backend_ok} -eq 1 && ${supertone_ok} -eq 1 && ${kokoro_ok} -eq 1 && ${qwen_ok} -eq 1 && ${paddle_gpu} -eq 1 ]]; then
                echo "${LAMP_BLUE}  TTS mode ready | PaddleOCR GPU ✓ | Supertone ✓ | Kokoro ✓ | Qwen TTS ✓ | Backend ✓"
            elif [[ ${backend_ok} -eq 1 && ${supertone_ok} -eq 1 && ${kokoro_ok} -eq 1 && ${qwen_ok} -eq 1 ]]; then
                echo "${LAMP_YELLOW}  TTS mode ready | PaddleOCR ${paddle_device} | Supertone ✓ | Kokoro ✓ | Qwen TTS ✓ | Backend ✓"
            else
                echo "${LAMP_GREEN}  TTS mode partial | PaddleOCR ${paddle_device} | Supertone $( [[ ${supertone_ok} -eq 1 ]] && echo ✓ || echo ✗ ) | Kokoro $( [[ ${kokoro_ok} -eq 1 ]] && echo ✓ || echo ✗ ) | Qwen TTS $( [[ ${qwen_ok} -eq 1 ]] && echo ✓ || echo ✗ ) | Backend $( [[ ${backend_ok} -eq 1 ]] && echo ✓ || echo ✗ )"
            fi
            ;;
        *)
            if [[ ${backend_ok} -eq 1 && ${lm_ok} -eq 1 && ${supertone_ok} -eq 1 && ${kokoro_ok} -eq 1 && ${qwen_ok} -eq 1 && ${paddle_gpu} -eq 1 ]]; then
                echo "${LAMP_BLUE}  All mode ready | PaddleOCR GPU ✓ | LM Studio ✓ | Supertone ✓ | Kokoro ✓ | Qwen TTS ✓ | Backend ✓"
            elif [[ ${backend_ok} -eq 1 && ${lm_ok} -eq 1 && ${supertone_ok} -eq 1 && ${kokoro_ok} -eq 1 && ${qwen_ok} -eq 1 ]]; then
                echo "${LAMP_YELLOW}  All mode ready | PaddleOCR ${paddle_device} | LM Studio ✓ | Supertone ✓ | Kokoro ✓ | Qwen TTS ✓ | Backend ✓"
            else
                echo "${LAMP_GREEN}  All mode partial | PaddleOCR ${paddle_device} | LM Studio $( [[ ${lm_ok} -eq 1 ]] && echo ✓ || echo ✗ ) | Supertone $( [[ ${supertone_ok} -eq 1 ]] && echo ✓ || echo ✗ ) | Kokoro $( [[ ${kokoro_ok} -eq 1 ]] && echo ✓ || echo ✗ ) | Qwen TTS $( [[ ${qwen_ok} -eq 1 ]] && echo ✓ || echo ✗ ) | Backend $( [[ ${backend_ok} -eq 1 ]] && echo ✓ || echo ✗ )"
            fi
            ;;
    esac
}

show_health_block() {
    local mode="${1:-${ACTIVE_MODE:-all}}"

    check_paddle && ok "PaddleOCR (${PADDLE_HOST}:${PADDLE_PORT})" || warn "PaddleOCR unreachable"

    case "${mode}" in
        ocr)
            check_lm_studio && ok "LM Studio server" || warn "LM Studio server unreachable"
            check_lm_model_loaded && ok "LM Studio model (${LM_MODEL_ID})" || warn "LM Studio model not loaded"
            ;;
        tts)
            check_supertone && ok "Supertone (${SUPERTONE_HOST_CFG}:${SUPERTONE_PORT_CFG})" || warn "Supertone unreachable"
            if check_kokoro; then
                ok "Kokoro (${KOKORO_HOST_CFG}:${KOKORO_PORT_CFG}) — $(fetch_kokoro_device 2>/dev/null || echo unknown)"
            else
                warn "Kokoro unreachable"
            fi
            if check_qwen; then
                ok "Qwen TTS (${QWEN_HOST_CFG}:${QWEN_PORT_CFG}) — $(fetch_qwen_device 2>/dev/null || echo unknown)"
            else
                warn "Qwen TTS unreachable or not GPU-ready"
            fi
            ;;
        *)
            check_lm_studio && ok "LM Studio server" || warn "LM Studio server unreachable"
            check_lm_model_loaded && ok "LM Studio model (${LM_MODEL_ID})" || warn "LM Studio model not loaded"
            check_supertone && ok "Supertone (${SUPERTONE_HOST_CFG}:${SUPERTONE_PORT_CFG})" || warn "Supertone unreachable"
            if check_kokoro; then
                ok "Kokoro (${KOKORO_HOST_CFG}:${KOKORO_PORT_CFG}) — $(fetch_kokoro_device 2>/dev/null || echo unknown)"
            else
                warn "Kokoro unreachable"
            fi
            if check_qwen; then
                ok "Qwen TTS (${QWEN_HOST_CFG}:${QWEN_PORT_CFG}) — $(fetch_qwen_device 2>/dev/null || echo unknown)"
            else
                warn "Qwen TTS unreachable or not GPU-ready"
            fi
            ;;
    esac

    check_backend && ok "Backend (port ${APP_PORT})" || warn "Backend unreachable"

    if port_has_listener "${VITE_PORT}"; then
        warn "Vite dev server listening on ${VITE_PORT}"
    else
        dim "Vite dev server not running"
    fi
}

# ─── Live status loop ──────────────────────────────────────────────────────────
live_status_loop() {
    local prev_lamp=""
    local tick=0
    local mode="${ACTIVE_MODE:-all}"

    echo
    echo -e "  ${DIM}Press Ctrl+C to stop all known project services${RESET}"
    echo

    while true; do
        local lamp_line
        lamp_line=$(compute_mode_lamp "${mode}")

        if [[ "${lamp_line}" != "${prev_lamp}" ]]; then
            local ts
            ts=$(date '+%H:%M:%S')
            printf "\r\033[K  [%s]  %b\n" "${ts}" "${lamp_line}"
            prev_lamp="${lamp_line}"
        else
            local spinners=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
            local sp="${spinners[$((tick % ${#spinners[@]}))]}"
            printf "\r\033[K  ${DIM}%s${RESET}  %b" "${sp}" "${lamp_line}"
        fi

        tick=$((tick + 1))
        sleep 5
    done
}

# ─── Commands ──────────────────────────────────────────────────────────────────
cmd_start() {
    local cli_mode="${1:-}"

    ensure_dirs
    trap cleanup INT TERM

    if [[ -n "${cli_mode}" ]]; then
        set_mode "${cli_mode}"
    else
        select_mode
    fi

    echo -e "${BOLD}Config:${RESET}"
    echo "  Active mode    : ${ACTIVE_MODE_LABEL}"
    echo "  App port       : ${APP_PORT}"
    echo "  LM Studio      : ${LM_URL}"
    echo "  LM model       : ${LM_MODEL_ID}"
    echo "  PaddleOCR      : ${PADDLE_HOST}:${PADDLE_PORT}"
    echo "  Supertone      : ${SUPERTONE_HOST_CFG}:${SUPERTONE_PORT_CFG}"
    echo "  Kokoro         : ${KOKORO_HOST_CFG}:${KOKORO_PORT_CFG}"
    echo "  Qwen TTS       : ${QWEN_HOST_CFG}:${QWEN_PORT_CFG}"
    echo

    if [[ "${ACTIVE_MODE}" == "all" ]]; then
        echo -e "${BOLD}[0/3] VRAM Guard${RESET}"
        check_vram_guard || exit 1
        echo
    fi

    echo -e "${BOLD}[1/3] Sidecars${RESET}"
    start_paddleocr || startup_failed "PaddleOCR failed to start."

    if mode_includes_tts; then
        start_supertone || startup_failed "Supertone failed to start."
        start_kokoro || startup_failed "Kokoro failed to start."
        start_qwen || startup_failed "Qwen TTS failed to start."
    else
        dim "TTS sidecars skipped in OCR mode."
    fi
    echo

    echo -e "${BOLD}[2/3] LM Studio${RESET}"
    if mode_includes_lm; then
        start_lm_studio_server || startup_failed "LM Studio server failed to start."
        load_lm_model || startup_failed "LM Studio model ${LM_MODEL_ID} failed to load."
    else
        dim "LM Studio skipped in TTS mode."
    fi
    echo

    echo -e "${BOLD}[3/3] Backend${RESET}"
    start_backend || startup_failed "Backend failed to start."
    echo

    if command -v xdg-open &>/dev/null; then
        xdg-open "http://localhost:${APP_PORT}" &>/dev/null &
    elif command -v open &>/dev/null; then
        open "http://localhost:${APP_PORT}" &>/dev/null &
    fi

    echo -e "${BOLD}${GREEN}  ┌─────────────────────────────────────────┐${RESET}"
    echo -e "${BOLD}${GREEN}  │  Open in browser:                       │${RESET}"
    echo -e "${BOLD}${GREEN}  │                                         │${RESET}"
    printf "${BOLD}${GREEN}  │  %-39s│${RESET}\n" "---> http://localhost:${APP_PORT}"
    echo -e "${BOLD}${GREEN}  │                                         │${RESET}"
    echo -e "${BOLD}${GREEN}  └─────────────────────────────────────────┘${RESET}"
    echo

    echo -e "${BOLD}Logs:${RESET}"
    dim "  PaddleOCR  → ${LOG_PADDLE}"
    dim "  Supertone  → ${LOG_SUPERTONE}"
    dim "  Kokoro     → ${LOG_KOKORO}"
    dim "  Qwen TTS   → ${LOG_QWEN}"
    dim "  LM Studio  → ${LOG_LM}"
    dim "  Backend    → ${LOG_BACKEND}"
    echo

    echo -e "${BOLD}Status lamp legend:${RESET}"
    echo "  ${LAMP_BLUE}  Selected mode fully operational"
    echo "  ${LAMP_GREEN}  PaddleOCR reachable, but one or more required services missing"
    echo "  ${LAMP_YELLOW}  Selected mode ready, but PaddleOCR is on CPU"
    echo "  ${LAMP_RED}  PaddleOCR unreachable"
    echo

    live_status_loop
}

cmd_stop() {
    ensure_dirs
    read_state
    header "OCR App — Stop"
    global_cleanup
    echo
}

cmd_status() {
    ensure_dirs
    read_state

    header "OCR App — Status"

    echo -e "${BOLD}Active mode:${RESET}"
    if [[ -n "${ACTIVE_MODE}" ]]; then
        ok "${ACTIVE_MODE_LABEL}"
    else
        warn "No launcher state file found"
    fi
    echo

    echo -e "${BOLD}Processes:${RESET}"
    show_process_state "PaddleOCR" "${PID_PADDLE}" "${PADDLE_PORT}"

    case "${ACTIVE_MODE:-all}" in
        ocr)
            show_process_state "Backend" "${PID_BACKEND}" "${APP_PORT}"
            if port_has_listener 1234; then
                ok "LM Studio server listening on 1234"
            else
                fail "LM Studio server stopped"
            fi
            ;;
        tts)
            show_process_state "Supertone" "${PID_SUPERTONE}" "${SUPERTONE_PORT_CFG}"
            show_process_state "Kokoro" "${PID_KOKORO}" "${KOKORO_PORT_CFG}"
            show_process_state "Qwen TTS" "${PID_QWEN}" "${QWEN_PORT_CFG}"
            show_process_state "Backend" "${PID_BACKEND}" "${APP_PORT}"
            ;;
        *)
            if port_has_listener 1234; then
                ok "LM Studio server listening on 1234"
            else
                fail "LM Studio server stopped"
            fi
            show_process_state "Supertone" "${PID_SUPERTONE}" "${SUPERTONE_PORT_CFG}"
            show_process_state "Kokoro" "${PID_KOKORO}" "${KOKORO_PORT_CFG}"
            show_process_state "Qwen TTS" "${PID_QWEN}" "${QWEN_PORT_CFG}"
            show_process_state "Backend" "${PID_BACKEND}" "${APP_PORT}"
            ;;
    esac

    if port_has_listener "${VITE_PORT}"; then
        warn "Vite dev server listening on ${VITE_PORT}"
    else
        dim "Vite dev server stopped"
    fi
    echo

    echo -e "${BOLD}Health probes:${RESET}"
    show_health_block "${ACTIVE_MODE:-all}"
    echo

    echo -e "${BOLD}Lamp:${RESET}"
    echo "  $(compute_mode_lamp "${ACTIVE_MODE:-all}")"
    echo
}

cmd_wipe() {
    ensure_dirs
    read_state
    header "OCR App — Full Wipe"
    echo -e "${YELLOW}  This will stop all known project services and remove build artifacts.${RESET}"
    echo
    read -rp "  Type 'wipe' to confirm: " CONFIRM
    [[ "${CONFIRM}" != "wipe" ]] && { echo; log "Cancelled."; echo; exit 0; }
    echo

    global_cleanup

    log "Removing build artifacts..."
    rm -rf "${ROOT_DIR}/backend/dist" \
           "${ROOT_DIR}/frontend/dist" \
           "${ROOT_DIR}/frontend/tsconfig.tsbuildinfo"

    echo
    ok "Done. Run '$0' to start again."
    echo
}

# ─── Entrypoint ────────────────────────────────────────────────────────────────
case "${1:-start}" in
    start)  cmd_start "${2:-}"  ;;
    stop)   cmd_stop   ;;
    wipe)   cmd_wipe   ;;
    status) cmd_status ;;
    *)
        echo
        echo -e "  Usage: ${BOLD}$(basename "$0") [start|stop|wipe|status] [mode]${RESET}"
        echo
        echo "    (no args)    — choose a mode interactively, start services and monitor"
        echo "    start        — choose a mode interactively, start services and monitor"
        echo "    start ocr    — start OCR mode directly (PaddleOCR + LM Studio + backend)"
        echo "    start tts    — start TTS mode directly (PaddleOCR + TTS engines + backend)"
        echo "    start all    — start all services directly (OCR + TTS)"
        echo "    stop         — stop all known project services and clear ports"
        echo "    status       — show mode-aware health and process state"
        echo "    wipe         — stop everything + remove build artifacts"
        echo
        exit 1
        ;;
esac
