#!/usr/bin/env bash
# OCR App — shared launcher implementation
#
#  ./ocr.sh             — start OCR mode (PaddleOCR + selected TTS sidecars + LM Studio + backend)
#  ./tts.sh             — start TTS mode (PaddleOCR + selected TTS sidecars + backend)
#  ./ocr-tts.sh         — start all services (OCR + selected TTS sidecars + LM Studio model + backend)
#  ./stack.sh           — interactive stack menu (start, stop, switch, status)
#  ./*.sh stop          — stop all known project services and clear ports
#  ./*.sh status        — show current mode, health and process state
#  ./*.sh wipe          — stop everything + remove build artifacts
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
F5_VENV="${ROOT_DIR}/services/tts/f5-service/.venv"
VOXTRAL_VENV="${ROOT_DIR}/services/tts/voxtral-service/.venv"

SUPERTONE_TORCH_LIB="${SUPERTONE_VENV}/lib/python3.12/site-packages/torch/lib"
KOKORO_TORCH_LIB="${KOKORO_VENV}/lib/python3.12/site-packages/torch/lib"
F5_TORCH_LIB="${F5_VENV}/lib/python3.12/site-packages/torch/lib"
VOXTRAL_TORCH_LIB="${VOXTRAL_VENV}/lib/python3.12/site-packages/torch/lib"
TORCH_LIB_SYSTEM="/home/cbandy/.local/lib/python3.12/site-packages/torch/lib"

PID_DIR="${ROOT_DIR}/.pids"
PID_PADDLE="${PID_DIR}/paddleocr.pid"
PID_SUPERTONE="${PID_DIR}/supertone.pid"
PID_KOKORO="${PID_DIR}/kokoro.pid"
PID_F5="${PID_DIR}/f5.pid"
PID_VOXTRAL="${PID_DIR}/voxtral.pid"
PID_BACKEND="${PID_DIR}/backend.pid"
PID_SVC_OCR="${PID_DIR}/svc-ocr.pid"
PID_SVC_TTS="${PID_DIR}/svc-tts.pid"
PID_SVC_DOC="${PID_DIR}/svc-doc.pid"
PID_SVC_VOCAB="${PID_DIR}/svc-vocab.pid"
PID_SVC_AGENTIC="${PID_DIR}/svc-agentic.pid"
STATE_FILE="${PID_DIR}/ocr-launcher.state"

LOG_DIR="${ROOT_DIR}/logs"
LOG_PADDLE="${LOG_DIR}/paddleocr.log"
LOG_SUPERTONE="${LOG_DIR}/supertone.log"
LOG_KOKORO="${LOG_DIR}/kokoro.log"
LOG_F5="${LOG_DIR}/f5.log"
LOG_VOXTRAL="${LOG_DIR}/voxtral.log"
LOG_BACKEND="${LOG_DIR}/backend.log"
LOG_SVC_OCR="${LOG_DIR}/svc-ocr.log"
LOG_SVC_TTS="${LOG_DIR}/svc-tts.log"
LOG_SVC_DOC="${LOG_DIR}/svc-doc.log"
LOG_SVC_VOCAB="${LOG_DIR}/svc-vocab.log"
LOG_SVC_AGENTIC="${LOG_DIR}/svc-agentic.log"
LOG_LM="${LOG_DIR}/lmstudio.log"

ENV_FILE="${ROOT_DIR}/.env"
TTS_MODELS_CONFIG_FILE="${TTS_MODELS_CONFIG_FILE:-${ROOT_DIR}/scripts/linux/tts-models.conf}"

# ─── Load .env ─────────────────────────────────────────────────────────────────
if [[ -f "${ENV_FILE}" ]]; then
    set -o allexport
    # shellcheck disable=SC1090
    source <(grep -E '^[A-Z_]+=\S' "${ENV_FILE}")
    set +o allexport
fi

# ─── Load launcher TTS config ──────────────────────────────────────────────────
if [[ -f "${TTS_MODELS_CONFIG_FILE}" ]]; then
    # shellcheck disable=SC1090
    source "${TTS_MODELS_CONFIG_FILE}"
fi

# ─── Resolve config ─────────────────────────────────────────────────────────────
APP_PORT="${PORT:-3000}"
OCR_SERVICE_PORT="${OCR_SERVICE_PORT:-3901}"
TTS_SERVICE_PORT="${TTS_SERVICE_PORT:-3902}"
DOCUMENT_SERVICE_PORT="${DOCUMENT_SERVICE_PORT:-3903}"
VOCABULARY_SERVICE_PORT="${VOCABULARY_SERVICE_PORT:-3904}"
AGENTIC_SERVICE_PORT="${AGENTIC_SERVICE_PORT:-3905}"
LM_URL="${LM_STUDIO_BASE_URL:-http://localhost:1234/v1}"
LM_BASE_URL="${LM_URL%/v1}"
LM_MODEL_ID="${STRUCTURING_MODEL:-qwen/qwen3.5-9b}"
LM_CLI_BIN="${LM_CLI_BIN:-${HOME}/.lmstudio/bin/lms}"
LM_HOSTPORT="${LM_BASE_URL#*://}"
LM_HOSTPORT="${LM_HOSTPORT%%/*}"
if [[ "${LM_HOSTPORT}" =~ :([0-9]+)$ ]]; then
    LM_PORT="${BASH_REMATCH[1]}"
elif [[ "${LM_BASE_URL}" == https://* ]]; then
    LM_PORT="443"
else
    LM_PORT="80"
fi

PADDLE_HOST="${PADDLEOCR_HOST:-localhost}"
PADDLE_PORT="${PADDLEOCR_PORT:-8000}"

SUPERTONE_HOST_CFG="${SUPERTONE_HOST:-localhost}"
SUPERTONE_PORT_CFG="${SUPERTONE_PORT:-8100}"

KOKORO_HOST_CFG="${KOKORO_HOST:-localhost}"
KOKORO_PORT_CFG="${KOKORO_PORT:-8200}"

F5_HOST_CFG="${F5_TTS_HOST:-localhost}"
F5_PORT_CFG="${F5_TTS_PORT:-8300}"
TTS_ENABLE_SUPERTONE_CFG="${TTS_ENABLE_SUPERTONE:-false}"
TTS_ENABLE_KOKORO_CFG="${TTS_ENABLE_KOKORO:-false}"
TTS_ENABLE_F5_CFG="${TTS_ENABLE_F5:-${F5_TTS_AUTO_START:-false}}"
TTS_ENABLE_VOXTRAL_CFG="${TTS_ENABLE_VOXTRAL:-true}"
F5_AUTO_START_CFG="${F5_TTS_AUTO_START:-${TTS_ENABLE_F5_CFG}}"

VOXTRAL_HOST_CFG="${VOXTRAL_HOST:-localhost}"
VOXTRAL_PORT_CFG="${VOXTRAL_PORT:-8400}"

VITE_PORT="${VITE_PORT:-5173}"
PROJECT_PORTS=("${APP_PORT}" "${OCR_SERVICE_PORT}" "${TTS_SERVICE_PORT}" "${DOCUMENT_SERVICE_PORT}" "${VOCABULARY_SERVICE_PORT}" "${AGENTIC_SERVICE_PORT}" "${VITE_PORT}" "${PADDLE_PORT}" "${SUPERTONE_PORT_CFG}" "${KOKORO_PORT_CFG}" "${F5_PORT_CFG}" "${VOXTRAL_PORT_CFG}")

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

flag_enabled() {
    case "${1,,}" in
        1|true|yes|on) return 0 ;;
        *) return 1 ;;
    esac
}

supertone_launcher_enabled() {
    flag_enabled "${TTS_ENABLE_SUPERTONE_CFG}"
}

kokoro_launcher_enabled() {
    flag_enabled "${TTS_ENABLE_KOKORO_CFG}"
}

f5_launcher_enabled() {
    flag_enabled "${TTS_ENABLE_F5_CFG}"
}

voxtral_launcher_enabled() {
    flag_enabled "${TTS_ENABLE_VOXTRAL_CFG}"
}

mode_includes_lm() {
    [[ "${ACTIVE_MODE}" == "ocr" || "${ACTIVE_MODE}" == "all" ]]
}

mode_includes_tts() {
    [[ "${ACTIVE_MODE}" == "tts" || "${ACTIVE_MODE}" == "all" ]]
}

mode_includes_kokoro() {
    [[ "${ACTIVE_MODE}" == "ocr" || "${ACTIVE_MODE}" == "tts" || "${ACTIVE_MODE}" == "all" ]]
}

mode_includes_backend() {
    [[ "${ACTIVE_MODE}" == "ocr" || "${ACTIVE_MODE}" == "tts" || "${ACTIVE_MODE}" == "all" ]]
}

f5_auto_start_enabled() {
    f5_launcher_enabled && flag_enabled "${F5_AUTO_START_CFG}"
}

supertone_required_in_mode() {
    mode_includes_tts && supertone_launcher_enabled
}

kokoro_required_in_mode() {
    mode_includes_kokoro && kokoro_launcher_enabled
}

voxtral_required_in_mode() {
    mode_includes_tts && voxtral_launcher_enabled
}

status_marker() {
    local ok="${1}"
    if [[ "${ok}" -eq 1 ]]; then
        printf '✓'
    else
        printf '✗'
    fi
}

service_lamp_part() {
    local label="${1}" enabled="${2}" ok="${3}"
    if [[ "${enabled}" -eq 1 ]]; then
        printf '%s %s' "${label}" "$(status_marker "${ok}")"
    else
        printf '%s off' "${label}"
    fi
}

show_disabled_service() {
    local name="${1}"
    dim "${name} disabled in ${TTS_MODELS_CONFIG_FILE}"
}

join_by() {
    local separator="${1}"
    shift || true
    local first=1
    local item

    for item in "$@"; do
        if [[ ${first} -eq 1 ]]; then
            printf '%s' "${item}"
            first=0
        else
            printf '%s%s' "${separator}" "${item}"
        fi
    done
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

kill_known_project_processes() {
    kill_by_pattern "PaddleOCR" "${ROOT_DIR}/services/ocr/paddleocr-service"
    kill_by_pattern "PaddleOCR" "services/ocr/paddleocr-service"
    kill_by_pattern "Supertone" "${ROOT_DIR}/services/tts/supertone-service"
    kill_by_pattern "Supertone" "services/tts/supertone-service"
    kill_by_pattern "Kokoro" "${ROOT_DIR}/services/tts/kokoro-service"
    kill_by_pattern "Kokoro" "services/tts/kokoro-service"
    kill_by_pattern "F5 TTS" "${ROOT_DIR}/services/tts/f5-service"
    kill_by_pattern "F5 TTS" "services/tts/f5-service"
    kill_by_pattern "Voxtral" "${ROOT_DIR}/services/tts/voxtral-service"
    kill_by_pattern "Voxtral" "services/tts/voxtral-service"
    kill_by_pattern "Gateway" "${ROOT_DIR}/backend/dist/gateway/main.js"
    kill_by_pattern "OCR service" "${ROOT_DIR}/backend/dist/services/ocr/src/main.js"
    kill_by_pattern "TTS service" "${ROOT_DIR}/backend/dist/services/tts/src/main.js"
    kill_by_pattern "Document service" "${ROOT_DIR}/backend/dist/services/document/src/main.js"
    kill_by_pattern "Vocabulary service" "${ROOT_DIR}/backend/dist/services/vocabulary/src/main.js"
    kill_by_pattern "Agentic service" "${ROOT_DIR}/backend/dist/services/agentic/src/main.js"
    kill_by_pattern "Frontend Vite" "${ROOT_DIR}/node_modules/.bin/vite"
    kill_by_pattern "Frontend Vite" "${ROOT_DIR}/node_modules/vite"
    kill_by_pattern "Frontend Vite" "node_modules/.bin/vite"
    kill_by_pattern "Frontend Vite" "npm run dev --workspace=frontend"
}

global_cleanup() {
    stop_service "Gateway" "${PID_BACKEND}"
    stop_service "Agentic service" "${PID_SVC_AGENTIC}"
    stop_service "Vocabulary service" "${PID_SVC_VOCAB}"
    stop_service "Document service" "${PID_SVC_DOC}"
    stop_service "TTS service" "${PID_SVC_TTS}"
    stop_service "OCR service" "${PID_SVC_OCR}"
    stop_service "F5 TTS" "${PID_F5}"
    stop_service "Voxtral" "${PID_VOXTRAL}"
    stop_service "Kokoro" "${PID_KOKORO}"
    stop_service "Supertone" "${PID_SUPERTONE}"
    stop_service "PaddleOCR" "${PID_PADDLE}"

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

rollback_startup() {
    local message="${1}"
    echo
    fail "${message}"
    if [[ "${ACTIVE_MODE}" == "all" ]]; then
        warn "Start OCR or TTS mode instead."
    fi
    echo
    header "Rolling back"
    global_cleanup
    echo
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

check_piper() {
    local json
    json=$(probe_json "http://${SUPERTONE_HOST_CFG}:${SUPERTONE_PORT_CFG}/health") || return 1
    echo "${json}" | python3 -c 'import json,sys; d=json.load(sys.stdin); p=d.get("piper", {}); raise SystemExit(0 if p.get("ready") is True and len(p.get("available_voices", [])) > 0 else 1)'
}

check_kokoro() {
    probe_url "http://${KOKORO_HOST_CFG}:${KOKORO_PORT_CFG}/health"
}

fetch_kokoro_device() {
    local json
    json=$(probe_json "http://${KOKORO_HOST_CFG}:${KOKORO_PORT_CFG}/health") || return 1
    echo "${json}" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("device", "unknown"))'
}

check_f5() {
    local json
    json=$(probe_json "http://${F5_HOST_CFG}:${F5_PORT_CFG}/health") || return 1
    echo "${json}" | python3 -c 'import json,sys; d=json.load(sys.stdin); raise SystemExit(0 if d.get("ready") is True and d.get("device") == "gpu" else 1)'
}

check_f5_http() {
    probe_url "http://${F5_HOST_CFG}:${F5_PORT_CFG}/health"
}

fetch_f5_device() {
    local json
    json=$(probe_json "http://${F5_HOST_CFG}:${F5_PORT_CFG}/health") || return 1
    echo "${json}" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("device", "unknown"))'
}

check_voxtral() {
    local json
    json=$(probe_json "http://${VOXTRAL_HOST_CFG}:${VOXTRAL_PORT_CFG}/health") || return 1
    echo "${json}" | python3 -c 'import json,sys; d=json.load(sys.stdin); raise SystemExit(0 if d.get("ready") is True and d.get("device") == "gpu" else 1)'
}

check_voxtral_http() {
    probe_url "http://${VOXTRAL_HOST_CFG}:${VOXTRAL_PORT_CFG}/health"
}

fetch_voxtral_device() {
    local json
    json=$(probe_json "http://${VOXTRAL_HOST_CFG}:${VOXTRAL_PORT_CFG}/health") || return 1
    echo "${json}" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("device", "unknown"))'
}

warm_f5() {
    if [[ ! -f "${F5_VENV}/bin/python" ]]; then
        return 1
    fi

    "${F5_VENV}/bin/python" "${ROOT_DIR}/services/tts/f5-service/smoke_test.py" \
        >> "${LOG_F5}" 2>&1
}

check_backend() {
    local code
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://localhost:${APP_PORT}/api/health" || true)
    [[ "${code}" == "200" || "${code}" == "503" ]]
}

check_ocr_service() {
    port_has_listener "${OCR_SERVICE_PORT}"
}

check_tts_service() {
    port_has_listener "${TTS_SERVICE_PORT}"
}

check_document_service() {
    port_has_listener "${DOCUMENT_SERVICE_PORT}"
}

check_vocabulary_service() {
    port_has_listener "${VOCABULARY_SERVICE_PORT}"
}

check_agentic_service() {
    port_has_listener "${AGENTIC_SERVICE_PORT}"
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

wait_for_check_with_diagnostics() {
    local label="${1}" timeout="${2}" check_fn="${3}" diag_fn="${4}" interval="${5:-15}"
    local i=0
    local next_diag="${interval}"

    echo -n "  Waiting for ${label}"
    until "${check_fn}" || [[ ${i} -ge ${timeout} ]]; do
        echo -n "."
        sleep 1
        i=$((i + 1))

        if [[ -n "${diag_fn}" && ${i} -ge ${next_diag} ]]; then
            echo
            "${diag_fn}" "${i}" || true
            echo -n "  Waiting for ${label}"
            next_diag=$((next_diag + interval))
        fi
    done
    echo

    "${check_fn}"
}

shorten_text() {
    local text="${1:-}"
    local max_len="${2:-220}"

    if (( ${#text} <= max_len )); then
        printf '%s' "${text}"
    else
        printf '%s...' "${text:0:max_len}"
    fi
}

diagnose_kokoro_startup() {
    local elapsed="${1:-0}"
    local pid_state="missing"
    local port_state="closed"
    local health_json=""
    local line

    if is_running "${PID_KOKORO}"; then
        pid_state="running:$(cat "${PID_KOKORO}")"
    elif [[ -f "${PID_KOKORO}" ]]; then
        pid_state="stale:$(cat "${PID_KOKORO}")"
    fi

    if port_has_listener "${KOKORO_PORT_CFG}"; then
        port_state="listening"
    fi

    dim "Kokoro diagnostics @ ${elapsed}s: pid=${pid_state}, port ${KOKORO_PORT_CFG}=${port_state}"

    health_json=$(curl -fsS --max-time 2 "http://${KOKORO_HOST_CFG}:${KOKORO_PORT_CFG}/health" 2>/dev/null || true)
    if [[ -n "${health_json}" ]]; then
        dim "Kokoro /health: $(shorten_text "${health_json}" 220)"
    else
        dim "Kokoro /health: no response yet"
    fi

    if [[ -f "${LOG_KOKORO}" ]]; then
        while IFS= read -r line; do
            [[ -n "${line}" ]] || continue
            dim "Kokoro log: $(shorten_text "${line}" 220)"
        done < <(tail -n 5 "${LOG_KOKORO}" 2>/dev/null || true)
    else
        dim "Kokoro log: file not created yet"
    fi
}

assign_mode() {
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
}

set_mode() {
    assign_mode "${1}"
    write_state
}

apply_requested_mode_if_unset() {
    local requested_mode="${1:-}"
    [[ -n "${ACTIVE_MODE}" || -z "${requested_mode}" ]] && return 0
    assign_mode "${requested_mode}"
}

confirm_all_vram_readiness() {
    [[ "${ACTIVE_MODE}" == "all" ]] || return 0

    warn "ALL stack startup can consume a large amount of VRAM."
    warn "Make sure you really have enough free VRAM before continuing."

    if [[ ! -t 0 ]]; then
        warn "Interactive confirmation is not available in this shell."
        warn "Rerun the launcher interactively and confirm the VRAM warning."
        return 1
    fi

    while true; do
        echo
        read -rp "Type 'YES' to confirm that you have enough VRAM for the ALL stack: " confirm
        case "${confirm}" in
            YES)
                ok "VRAM warning acknowledged."
                echo
                return 0
                ;;
            "")
                warn "Confirmation is required to continue."
                ;;
            *)
                warn "Please type the exact word: YES"
                ;;
        esac
    done
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
        --workers "${PADDLEOCR_WORKERS:-1}" \
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
    dim "Kokoro log file: ${LOG_KOKORO}"
    env KOKORO_USE_GPU=true \
        HSA_OVERRIDE_GFX_VERSION="${HSA_OVERRIDE_GFX_VERSION:-11.0.0}" \
        LD_LIBRARY_PATH="${torch_lib}:${LD_LIBRARY_PATH:-}" \
        "${KOKORO_VENV}/bin/python" -m uvicorn \
        --app-dir "${ROOT_DIR}/services/tts/kokoro-service" main:app \
        --host 0.0.0.0 --port "${KOKORO_PORT_CFG}" \
        > "${LOG_KOKORO}" 2>&1 &
    echo $! > "${PID_KOKORO}"
    dim "Kokoro process launched with PID $(cat "${PID_KOKORO}")"

    if wait_for_check_with_diagnostics "Kokoro" 120 check_kokoro diagnose_kokoro_startup 15; then
        ok "Kokoro ready (PID $(cat "${PID_KOKORO}"))"
        return 0
    fi

    diagnose_kokoro_startup 120 || true
    warn "Kokoro did not respond — check ${LOG_KOKORO}"
    return 1
}

start_f5() {
    local torch_lib

    if check_f5; then
        ok "F5 TTS already reachable on GPU"
        return 0
    fi

    if check_f5_http; then
        log "F5 TTS HTTP is already reachable. Waiting for GPU-ready state..."
        if wait_for_check_with_diagnostics "F5 TTS GPU readiness" 60 check_f5 diagnose_f5_startup 10; then
            ok "F5 TTS ready on GPU"
            return 0
        fi
        log "F5 TTS did not become ready from /health alone. Trying warmup fallback..."
        if warm_f5 && wait_for_check_with_diagnostics "F5 TTS GPU readiness" 30 check_f5 diagnose_f5_startup 10; then
            ok "F5 TTS ready on GPU after warmup"
            return 0
        fi
        diagnose_f5_startup 90 || true
        warn "F5 TTS warmup failed on existing sidecar — check ${LOG_F5}"
        return 1
    fi

    if is_running "${PID_F5}"; then
        ok "F5 TTS already running (PID $(cat "${PID_F5}"))"
        return 0
    fi

    if [[ ! -f "${F5_VENV}/bin/python" ]]; then
        warn "F5 TTS venv not found at ${F5_VENV}"
        warn "Run: cd services/tts/f5-service && python3 -m venv --system-site-packages .venv && .venv/bin/pip install -r requirements.txt"
        return 1
    fi

    torch_lib=$(resolve_torch_lib "${F5_TORCH_LIB}")

    log "Starting F5 TTS sidecar (port ${F5_PORT_CFG})..."
    dim "F5 log file: ${LOG_F5}"
    env F5_TTS_REQUIRE_GPU=true \
        HSA_OVERRIDE_GFX_VERSION="${HSA_OVERRIDE_GFX_VERSION:-11.0.0}" \
        LD_LIBRARY_PATH="${torch_lib}:${LD_LIBRARY_PATH:-}" \
        "${F5_VENV}/bin/python" -m uvicorn \
        --app-dir "${ROOT_DIR}/services/tts/f5-service" main:app \
        --host 0.0.0.0 --port "${F5_PORT_CFG}" \
        > "${LOG_F5}" 2>&1 &
    echo $! > "${PID_F5}"
    dim "F5 process launched with PID $(cat "${PID_F5}")"

    if ! wait_for_check "F5 TTS HTTP" 30 check_f5_http; then
        diagnose_f5_startup 30 || true
        warn "F5 TTS did not expose /health — check ${LOG_F5}"
        return 1
    fi

    if wait_for_check_with_diagnostics "F5 TTS GPU readiness" 60 check_f5 diagnose_f5_startup 10; then
        ok "F5 TTS ready on GPU (PID $(cat "${PID_F5}"))"
        return 0
    fi

    log "F5 TTS did not become ready from /health alone. Trying warmup fallback..."
    if warm_f5 && wait_for_check_with_diagnostics "F5 TTS GPU readiness" 30 check_f5 diagnose_f5_startup 10; then
        ok "F5 TTS ready on GPU after warmup (PID $(cat "${PID_F5}"))"
        return 0
    fi

    diagnose_f5_startup 90 || true
    warn "F5 TTS did not become GPU-ready — check ${LOG_F5}"
    return 1
}

start_voxtral_optional() {
    local torch_lib

    if check_voxtral; then
        ok "Voxtral already reachable on GPU"
        return 0
    fi

    if check_voxtral_http; then
        warn "Voxtral HTTP is reachable, but readiness is degraded. Keeping the stack up."
        diagnose_voxtral_startup 30 || true
        return 0
    fi

    if is_running "${PID_VOXTRAL}"; then
        warn "Voxtral already running (PID $(cat "${PID_VOXTRAL}")) but not ready"
        diagnose_voxtral_startup 15 || true
        return 0
    fi

    if [[ ! -f "${VOXTRAL_VENV}/bin/python" ]]; then
        warn "Voxtral venv not found at ${VOXTRAL_VENV}"
        warn "Run: cd services/tts/voxtral-service && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
        warn "The adapter builds/runs the ROCm Docker runtime itself on first ready-mode startup."
        return 0
    fi

    torch_lib=$(resolve_torch_lib "${VOXTRAL_TORCH_LIB}")

    log "Starting Voxtral sidecar (port ${VOXTRAL_PORT_CFG})..."
    dim "Voxtral log file: ${LOG_VOXTRAL}"
    env HSA_OVERRIDE_GFX_VERSION="${HSA_OVERRIDE_GFX_VERSION:-11.0.0}" \
        LD_LIBRARY_PATH="${torch_lib}:${LD_LIBRARY_PATH:-}" \
        "${VOXTRAL_VENV}/bin/python" -m uvicorn \
        --app-dir "${ROOT_DIR}/services/tts/voxtral-service" main:app \
        --host 0.0.0.0 --port "${VOXTRAL_PORT_CFG}" \
        > "${LOG_VOXTRAL}" 2>&1 &
    echo $! > "${PID_VOXTRAL}"
    dim "Voxtral process launched with PID $(cat "${PID_VOXTRAL}")"

    if ! wait_for_check "Voxtral HTTP" 30 check_voxtral_http; then
        warn "Voxtral did not expose /health. Continuing without it."
        warn "The project-local Voxtral cache lives under services/tts/voxtral-service/models/"
        diagnose_voxtral_startup 30 || true
        return 0
    fi

    if wait_for_check_with_diagnostics "Voxtral GPU readiness" 60 check_voxtral diagnose_voxtral_startup 10; then
        ok "Voxtral ready on GPU (PID $(cat "${PID_VOXTRAL}"))"
        return 0
    fi

    warn "Voxtral stayed in no-go mode on this stack. Keeping the rest of TTS online."
    warn "Check project-local model/runtime cache under services/tts/voxtral-service/models/"
    diagnose_voxtral_startup 90 || true
    return 0
}

start_lm_studio_server() {
    if check_lm_studio; then
        ok "LM Studio server reachable"
        return 0
    fi

    warn "LM Studio is not reachable at ${LM_URL}"
    warn "Start LM Studio manually, then rerun: $0 start ${ACTIVE_MODE}"
    return 1
}

load_lm_model() {
    if check_lm_model_loaded; then
        ok "LM Studio model loaded (${LM_MODEL_ID})"
        return 0
    fi

    warn "LM Studio model is not loaded: ${LM_MODEL_ID}"
    warn "Load the model manually in LM Studio, then rerun: $0 start ${ACTIVE_MODE}"
    return 1
}

diagnose_backend_startup() {
    local elapsed="${1:-0}"
    local pid_state="missing"
    local port_state="closed"
    local health_code="none"
    local line

    if is_running "${PID_BACKEND}"; then
        pid_state="running:$(cat "${PID_BACKEND}")"
    elif [[ -f "${PID_BACKEND}" ]]; then
        pid_state="stale:$(cat "${PID_BACKEND}")"
    fi

    if port_has_listener "${APP_PORT}"; then
        port_state="listening"
    fi

    health_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://localhost:${APP_PORT}/api/health" || true)
    [[ -n "${health_code}" ]] || health_code="none"

    dim "Gateway diagnostics @ ${elapsed}s: pid=${pid_state}, port ${APP_PORT}=${port_state}, /api/health=${health_code}"

    if [[ -f "${LOG_BACKEND}" ]]; then
        while IFS= read -r line; do
            [[ -n "${line}" ]] || continue
            dim "Gateway log: $(shorten_text "${line}" 220)"
        done < <(tail -n 5 "${LOG_BACKEND}" 2>/dev/null || true)
    else
        dim "Gateway log: file not created yet"
    fi
}

diagnose_f5_startup() {
    local elapsed="${1:-0}"
    local pid_state="missing"
    local port_state="closed"
    local health_json=""
    local line

    if is_running "${PID_F5}"; then
        pid_state="running:$(cat "${PID_F5}")"
    elif [[ -f "${PID_F5}" ]]; then
        pid_state="stale:$(cat "${PID_F5}")"
    fi

    if port_has_listener "${F5_PORT_CFG}"; then
        port_state="listening"
    fi

    dim "F5 diagnostics @ ${elapsed}s: pid=${pid_state}, port ${F5_PORT_CFG}=${port_state}"

    health_json=$(curl -fsS --max-time 2 "http://${F5_HOST_CFG}:${F5_PORT_CFG}/health" 2>/dev/null || true)
    if [[ -n "${health_json}" ]]; then
        dim "F5 /health: $(shorten_text "${health_json}" 220)"
    else
        dim "F5 /health: no response yet"
    fi

    if [[ -f "${LOG_F5}" ]]; then
        while IFS= read -r line; do
            [[ -n "${line}" ]] || continue
            dim "F5 log: $(shorten_text "${line}" 220)"
        done < <(tail -n 5 "${LOG_F5}" 2>/dev/null || true)
    else
        dim "F5 log: file not created yet"
    fi
}

diagnose_voxtral_startup() {
    local elapsed="${1:-0}"
    local pid_state="missing"
    local port_state="closed"
    local health_json=""
    local line

    if is_running "${PID_VOXTRAL}"; then
        pid_state="running:$(cat "${PID_VOXTRAL}")"
    elif [[ -f "${PID_VOXTRAL}" ]]; then
        pid_state="stale:$(cat "${PID_VOXTRAL}")"
    fi

    if port_has_listener "${VOXTRAL_PORT_CFG}"; then
        port_state="listening"
    fi

    dim "Voxtral diagnostics @ ${elapsed}s: pid=${pid_state}, port ${VOXTRAL_PORT_CFG}=${port_state}"

    health_json=$(curl -fsS --max-time 2 "http://${VOXTRAL_HOST_CFG}:${VOXTRAL_PORT_CFG}/health" 2>/dev/null || true)
    if [[ -n "${health_json}" ]]; then
        dim "Voxtral /health: $(shorten_text "${health_json}" 220)"
    else
        dim "Voxtral /health: no response yet"
    fi

    if [[ -f "${LOG_VOXTRAL}" ]]; then
        while IFS= read -r line; do
            [[ -n "${line}" ]] || continue
            dim "Voxtral log: $(shorten_text "${line}" 220)"
        done < <(tail -n 5 "${LOG_VOXTRAL}" 2>/dev/null || true)
    else
        dim "Voxtral log: file not created yet"
    fi

    if [[ -d "${ROOT_DIR}/services/tts/voxtral-service/models" ]]; then
        dim "Voxtral cache dir: ${ROOT_DIR}/services/tts/voxtral-service/models"
    fi
}

start_backend() {
    if check_backend; then
        ok "Gateway already reachable"
        return 0
    fi

    if is_running "${PID_BACKEND}"; then
        ok "Gateway already running (PID $(cat "${PID_BACKEND}"))"
        return 0
    fi

    cd "${ROOT_DIR}"

    if [[ -f "backend/dist/gateway/main.js" && -f "backend/dist/services/ocr/src/main.js" && -f "backend/dist/services/tts/src/main.js" && -f "backend/dist/services/document/src/main.js" && -f "backend/dist/services/vocabulary/src/main.js" && -f "frontend/dist/index.html" ]]; then
        dim "Build artifacts found — skipping build."
    else
        log "Building app (frontend + backend)..."
        bash scripts/linux/run-js-command.sh npm run build
        echo
    fi

    local lm_smoke_only="false"
    if ! mode_includes_lm; then
        lm_smoke_only="true"
    fi

    start_tcp_service \
        "OCR service" \
        "${PID_SVC_OCR}" \
        "${LOG_SVC_OCR}" \
        "export LM_STUDIO_SMOKE_ONLY=${lm_smoke_only}; bash scripts/linux/run-js-command.sh node backend/dist/services/ocr/src/main.js" \
        check_ocr_service \
        30 || return 1

    start_tcp_service \
        "TTS service" \
        "${PID_SVC_TTS}" \
        "${LOG_SVC_TTS}" \
        "bash scripts/linux/run-js-command.sh node backend/dist/services/tts/src/main.js" \
        check_tts_service \
        30 || return 1

    start_tcp_service \
        "Document service" \
        "${PID_SVC_DOC}" \
        "${LOG_SVC_DOC}" \
        "bash scripts/linux/run-js-command.sh node backend/dist/services/document/src/main.js" \
        check_document_service \
        30 || return 1

    start_tcp_service \
        "Vocabulary service" \
        "${PID_SVC_VOCAB}" \
        "${LOG_SVC_VOCAB}" \
        "export LM_STUDIO_SMOKE_ONLY=${lm_smoke_only}; bash scripts/linux/run-js-command.sh node backend/dist/services/vocabulary/src/main.js" \
        check_vocabulary_service \
        30 || return 1

    if [[ -n "${OPENAI_API_KEY:-}" ]]; then
        start_tcp_service \
            "Agentic service" \
            "${PID_SVC_AGENTIC}" \
            "${LOG_SVC_AGENTIC}" \
            "bash scripts/linux/run-js-command.sh node backend/dist/services/agentic/src/main.js" \
            check_agentic_service \
            30 || return 1
    else
        dim "Agentic service skipped because OPENAI_API_KEY is not set."
    fi

    log "Starting API gateway (port ${APP_PORT})..."
    dim "Gateway log file: ${LOG_BACKEND}"
    bash scripts/linux/run-js-command.sh node backend/dist/gateway/main.js > "${LOG_BACKEND}" 2>&1 &
    echo $! > "${PID_BACKEND}"
    dim "Gateway process launched with PID $(cat "${PID_BACKEND}")"

    if wait_for_check_with_diagnostics "gateway" 90 check_backend diagnose_backend_startup 15; then
        ok "Gateway ready (PID $(cat "${PID_BACKEND}"))  →  http://localhost:${APP_PORT}"
        return 0
    fi

    diagnose_backend_startup 90 || true
    warn "Gateway did not respond — check ${LOG_BACKEND}"
    return 1
}

start_tcp_service() {
    local name="${1}" pid_file="${2}" log_file="${3}" command="${4}" check_fn="${5}" timeout="${6:-30}"

    if "${check_fn}"; then
        ok "${name} already reachable"
        return 0
    fi

    if is_running "${pid_file}"; then
        ok "${name} already running (PID $(cat "${pid_file}"))"
        return 0
    fi

    log "Starting ${name}..."
    dim "${name} log file: ${log_file}"
    bash -lc "${command}" > "${log_file}" 2>&1 &
    echo $! > "${pid_file}"
    dim "${name} process launched with PID $(cat "${pid_file}")"

    if wait_for_check "${name}" "${timeout}" "${check_fn}"; then
        ok "${name} ready (PID $(cat "${pid_file}"))"
        return 0
    fi

    warn "${name} did not respond — check ${log_file}"
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
    local piper_ok=0
    local kokoro_ok=0
    local f5_ok=0
    local voxtral_ok=0
    local backend_ok=0
    local paddle_device="unknown"
    local supertone_enabled=0
    local piper_enabled=0
    local kokoro_enabled=0
    local f5_enabled=0
    local voxtral_enabled=0
    local ocr_kokoro_ready=1
    local tts_supertone_ready=1
    local tts_piper_ready=1
    local tts_kokoro_ready=1
    local tts_f5_ready=1
    local tts_voxtral_ready=1
    local all_supertone_ready=1
    local all_piper_ready=1
    local all_kokoro_ready=1
    local all_f5_ready=1
    local all_voxtral_ready=1

    if check_paddle; then
        paddle_ok=1
        paddle_device=$(fetch_paddle_device 2>/dev/null || echo "unknown")
        [[ "${paddle_device}" == "gpu" ]] && paddle_gpu=1
    fi

    check_backend   && backend_ok=1 || true
    check_supertone && supertone_ok=1 || true
    check_piper     && piper_ok=1 || true
    check_kokoro    && kokoro_ok=1 || true
    check_f5        && f5_ok=1 || true
    check_voxtral   && voxtral_ok=1 || true
    check_lm_model_loaded && lm_ok=1 || true

    supertone_required_in_mode && supertone_enabled=1 || true
    supertone_required_in_mode && piper_enabled=1 || true
    kokoro_required_in_mode && kokoro_enabled=1 || true
    f5_auto_start_enabled && f5_enabled=1 || true
    voxtral_required_in_mode && voxtral_enabled=1 || true

    [[ ${kokoro_enabled} -eq 1 ]] && ocr_kokoro_ready=${kokoro_ok}
    [[ ${supertone_enabled} -eq 1 ]] && tts_supertone_ready=${supertone_ok}
    [[ ${piper_enabled} -eq 1 ]] && tts_piper_ready=${piper_ok}
    [[ ${kokoro_enabled} -eq 1 ]] && tts_kokoro_ready=${kokoro_ok}
    [[ ${f5_enabled} -eq 1 ]] && tts_f5_ready=${f5_ok}
    [[ ${voxtral_enabled} -eq 1 ]] && tts_voxtral_ready=${voxtral_ok}
    [[ ${supertone_enabled} -eq 1 ]] && all_supertone_ready=${supertone_ok}
    [[ ${piper_enabled} -eq 1 ]] && all_piper_ready=${piper_ok}
    [[ ${kokoro_enabled} -eq 1 ]] && all_kokoro_ready=${kokoro_ok}
    [[ ${f5_enabled} -eq 1 ]] && all_f5_ready=${f5_ok}
    [[ ${voxtral_enabled} -eq 1 ]] && all_voxtral_ready=${voxtral_ok}

    if [[ ${paddle_ok} -eq 0 ]]; then
        echo "${LAMP_RED}  PaddleOCR unreachable"
        return
    fi

    case "${mode}" in
        ocr)
            if [[ ${backend_ok} -eq 1 && ${lm_ok} -eq 1 && ${ocr_kokoro_ready} -eq 1 && ${paddle_gpu} -eq 1 ]]; then
                echo "${LAMP_BLUE}  OCR mode ready | PaddleOCR GPU ✓ | LM Studio ✓ | $(service_lamp_part "Kokoro" "${kokoro_enabled}" "${kokoro_ok}") | Gateway ✓"
            elif [[ ${backend_ok} -eq 1 && ${lm_ok} -eq 1 && ${ocr_kokoro_ready} -eq 1 ]]; then
                echo "${LAMP_YELLOW}  OCR mode ready | PaddleOCR ${paddle_device} | LM Studio ✓ | $(service_lamp_part "Kokoro" "${kokoro_enabled}" "${kokoro_ok}") | Gateway ✓"
            else
                echo "${LAMP_GREEN}  OCR mode partial | PaddleOCR ${paddle_device} | LM Studio $(status_marker "${lm_ok}") | $(service_lamp_part "Kokoro" "${kokoro_enabled}" "${kokoro_ok}") | Gateway $(status_marker "${backend_ok}")"
            fi
            ;;
        tts)
            if [[ ${backend_ok} -eq 1 && ${tts_supertone_ready} -eq 1 && ${tts_piper_ready} -eq 1 && ${tts_kokoro_ready} -eq 1 && ${tts_f5_ready} -eq 1 && ${tts_voxtral_ready} -eq 1 && ${paddle_gpu} -eq 1 ]]; then
                echo "${LAMP_BLUE}  TTS mode ready | PaddleOCR GPU ✓ | $(service_lamp_part "Supertone" "${supertone_enabled}" "${supertone_ok}") | $(service_lamp_part "Piper" "${piper_enabled}" "${piper_ok}") | $(service_lamp_part "Kokoro" "${kokoro_enabled}" "${kokoro_ok}") | $(service_lamp_part "F5" "${f5_enabled}" "${f5_ok}") | $(service_lamp_part "Voxtral" "${voxtral_enabled}" "${voxtral_ok}") | Gateway ✓"
            elif [[ ${backend_ok} -eq 1 && ${tts_supertone_ready} -eq 1 && ${tts_piper_ready} -eq 1 && ${tts_kokoro_ready} -eq 1 && ${tts_f5_ready} -eq 1 && ${tts_voxtral_ready} -eq 1 ]]; then
                echo "${LAMP_YELLOW}  TTS mode ready | PaddleOCR ${paddle_device} | $(service_lamp_part "Supertone" "${supertone_enabled}" "${supertone_ok}") | $(service_lamp_part "Piper" "${piper_enabled}" "${piper_ok}") | $(service_lamp_part "Kokoro" "${kokoro_enabled}" "${kokoro_ok}") | $(service_lamp_part "F5" "${f5_enabled}" "${f5_ok}") | $(service_lamp_part "Voxtral" "${voxtral_enabled}" "${voxtral_ok}") | Gateway ✓"
            else
                echo "${LAMP_GREEN}  TTS mode partial | PaddleOCR ${paddle_device} | $(service_lamp_part "Supertone" "${supertone_enabled}" "${supertone_ok}") | $(service_lamp_part "Piper" "${piper_enabled}" "${piper_ok}") | $(service_lamp_part "Kokoro" "${kokoro_enabled}" "${kokoro_ok}") | $(service_lamp_part "F5" "${f5_enabled}" "${f5_ok}") | $(service_lamp_part "Voxtral" "${voxtral_enabled}" "${voxtral_ok}") | Gateway $(status_marker "${backend_ok}")"
            fi
            ;;
        *)
            if [[ ${backend_ok} -eq 1 && ${lm_ok} -eq 1 && ${all_supertone_ready} -eq 1 && ${all_piper_ready} -eq 1 && ${all_kokoro_ready} -eq 1 && ${all_f5_ready} -eq 1 && ${all_voxtral_ready} -eq 1 && ${paddle_gpu} -eq 1 ]]; then
                echo "${LAMP_BLUE}  All mode ready | PaddleOCR GPU ✓ | LM Studio ✓ | $(service_lamp_part "Supertone" "${supertone_enabled}" "${supertone_ok}") | $(service_lamp_part "Piper" "${piper_enabled}" "${piper_ok}") | $(service_lamp_part "Kokoro" "${kokoro_enabled}" "${kokoro_ok}") | $(service_lamp_part "F5" "${f5_enabled}" "${f5_ok}") | $(service_lamp_part "Voxtral" "${voxtral_enabled}" "${voxtral_ok}") | Gateway ✓"
            elif [[ ${backend_ok} -eq 1 && ${lm_ok} -eq 1 && ${all_supertone_ready} -eq 1 && ${all_piper_ready} -eq 1 && ${all_kokoro_ready} -eq 1 && ${all_f5_ready} -eq 1 && ${all_voxtral_ready} -eq 1 ]]; then
                echo "${LAMP_YELLOW}  All mode ready | PaddleOCR ${paddle_device} | LM Studio ✓ | $(service_lamp_part "Supertone" "${supertone_enabled}" "${supertone_ok}") | $(service_lamp_part "Piper" "${piper_enabled}" "${piper_ok}") | $(service_lamp_part "Kokoro" "${kokoro_enabled}" "${kokoro_ok}") | $(service_lamp_part "F5" "${f5_enabled}" "${f5_ok}") | $(service_lamp_part "Voxtral" "${voxtral_enabled}" "${voxtral_ok}") | Gateway ✓"
            else
                echo "${LAMP_GREEN}  All mode partial | PaddleOCR ${paddle_device} | LM Studio $(status_marker "${lm_ok}") | $(service_lamp_part "Supertone" "${supertone_enabled}" "${supertone_ok}") | $(service_lamp_part "Piper" "${piper_enabled}" "${piper_ok}") | $(service_lamp_part "Kokoro" "${kokoro_enabled}" "${kokoro_ok}") | $(service_lamp_part "F5" "${f5_enabled}" "${f5_ok}") | $(service_lamp_part "Voxtral" "${voxtral_enabled}" "${voxtral_ok}") | Gateway $(status_marker "${backend_ok}")"
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
            if kokoro_required_in_mode; then
                if check_kokoro; then
                    ok "Kokoro (${KOKORO_HOST_CFG}:${KOKORO_PORT_CFG}) — $(fetch_kokoro_device 2>/dev/null || echo unknown)"
                else
                    warn "Kokoro unreachable"
                fi
            else
                show_disabled_service "Kokoro"
            fi
            ;;
        tts)
            if supertone_required_in_mode; then
                check_supertone && ok "Supertone (${SUPERTONE_HOST_CFG}:${SUPERTONE_PORT_CFG})" || warn "Supertone unreachable"
                check_piper && ok "Piper (shared via Supertone sidecar)" || warn "Piper unavailable in Supertone sidecar"
            else
                show_disabled_service "Supertone"
                show_disabled_service "Piper"
            fi
            if kokoro_required_in_mode; then
                if check_kokoro; then
                    ok "Kokoro (${KOKORO_HOST_CFG}:${KOKORO_PORT_CFG}) — $(fetch_kokoro_device 2>/dev/null || echo unknown)"
                else
                    warn "Kokoro unreachable"
                fi
            else
                show_disabled_service "Kokoro"
            fi
            if f5_auto_start_enabled; then
                if check_f5; then
                    ok "F5 TTS (${F5_HOST_CFG}:${F5_PORT_CFG}) — $(fetch_f5_device 2>/dev/null || echo unknown)"
                else
                    warn "F5 TTS unreachable or not GPU-ready"
                fi
            elif f5_launcher_enabled; then
                dim "F5 TTS enabled but auto-start disabled (${F5_HOST_CFG}:${F5_PORT_CFG})"
            else
                show_disabled_service "F5 TTS"
            fi
            if voxtral_required_in_mode; then
                if check_voxtral; then
                    ok "Voxtral (${VOXTRAL_HOST_CFG}:${VOXTRAL_PORT_CFG}) — $(fetch_voxtral_device 2>/dev/null || echo unknown)"
                else
                    warn "Voxtral unreachable or not GPU-ready"
                fi
            else
                show_disabled_service "Voxtral"
            fi
            ;;
        *)
            check_lm_studio && ok "LM Studio server" || warn "LM Studio server unreachable"
            check_lm_model_loaded && ok "LM Studio model (${LM_MODEL_ID})" || warn "LM Studio model not loaded"
            if supertone_required_in_mode; then
                check_supertone && ok "Supertone (${SUPERTONE_HOST_CFG}:${SUPERTONE_PORT_CFG})" || warn "Supertone unreachable"
                check_piper && ok "Piper (shared via Supertone sidecar)" || warn "Piper unavailable in Supertone sidecar"
            else
                show_disabled_service "Supertone"
                show_disabled_service "Piper"
            fi
            if kokoro_required_in_mode; then
                if check_kokoro; then
                    ok "Kokoro (${KOKORO_HOST_CFG}:${KOKORO_PORT_CFG}) — $(fetch_kokoro_device 2>/dev/null || echo unknown)"
                else
                    warn "Kokoro unreachable"
                fi
            else
                show_disabled_service "Kokoro"
            fi
            if f5_auto_start_enabled; then
                if check_f5; then
                    ok "F5 TTS (${F5_HOST_CFG}:${F5_PORT_CFG}) — $(fetch_f5_device 2>/dev/null || echo unknown)"
                else
                    warn "F5 TTS unreachable or not GPU-ready"
                fi
            elif f5_launcher_enabled; then
                dim "F5 TTS enabled but auto-start disabled (${F5_HOST_CFG}:${F5_PORT_CFG})"
            else
                show_disabled_service "F5 TTS"
            fi
            if voxtral_required_in_mode; then
                if check_voxtral; then
                    ok "Voxtral (${VOXTRAL_HOST_CFG}:${VOXTRAL_PORT_CFG}) — $(fetch_voxtral_device 2>/dev/null || echo unknown)"
                else
                    warn "Voxtral unreachable or not GPU-ready"
                fi
            else
                show_disabled_service "Voxtral"
            fi
            ;;
    esac

    if mode_includes_backend; then
        check_backend && ok "Gateway (port ${APP_PORT})" || warn "Gateway unreachable"
    else
        dim "Gateway skipped in ${mode^^} mode"
    fi

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
show_config_block() {
    echo -e "${BOLD}Config:${RESET}"
    echo "  Active mode    : ${ACTIVE_MODE_LABEL}"
    echo "  TTS config     : ${TTS_MODELS_CONFIG_FILE}"
    echo "  App port       : ${APP_PORT}"
    echo "  OCR TCP        : ${OCR_SERVICE_PORT}"
    echo "  TTS TCP        : ${TTS_SERVICE_PORT}"
    echo "  Document TCP   : ${DOCUMENT_SERVICE_PORT}"
    echo "  Vocabulary TCP : ${VOCABULARY_SERVICE_PORT}"
    echo "  Agentic TCP    : ${AGENTIC_SERVICE_PORT}"
    echo "  LM Studio      : ${LM_URL}"
    echo "  LM model       : ${LM_MODEL_ID}"
    echo "  PaddleOCR      : ${PADDLE_HOST}:${PADDLE_PORT}"
    echo "  Supertone      : ${SUPERTONE_HOST_CFG}:${SUPERTONE_PORT_CFG}"
    echo "  Kokoro         : ${KOKORO_HOST_CFG}:${KOKORO_PORT_CFG}"
    echo "  Voxtral        : ${VOXTRAL_HOST_CFG}:${VOXTRAL_PORT_CFG}"
    echo "  F5 TTS         : ${F5_HOST_CFG}:${F5_PORT_CFG} (auto-start: ${F5_AUTO_START_CFG})"
    echo "  Launch TTS     : supertone=$(supertone_launcher_enabled && echo on || echo off), kokoro=$(kokoro_launcher_enabled && echo on || echo off), f5=$(f5_launcher_enabled && echo on || echo off), voxtral=$(voxtral_launcher_enabled && echo on || echo off)"
    echo
}

show_backend_link_block() {
    if mode_includes_backend; then
        local project_url="http://localhost:${APP_PORT}"
        local open_sent=1

        if command -v xdg-open &>/dev/null; then
            xdg-open "${project_url}" &>/dev/null &
            open_sent=0
        elif command -v open &>/dev/null; then
            open "${project_url}" &>/dev/null &
            open_sent=0
        fi

        echo -e "${BOLD}${GREEN}  ┌─────────────────────────────────────────┐${RESET}"
        echo -e "${BOLD}${GREEN}  │  Open in browser:                       │${RESET}"
        echo -e "${BOLD}${GREEN}  │                                         │${RESET}"
        printf "${BOLD}${GREEN}  │  %-39s│${RESET}\n" "---> ${project_url}"
        echo -e "${BOLD}${GREEN}  │                                         │${RESET}"
        echo -e "${BOLD}${GREEN}  └─────────────────────────────────────────┘${RESET}"
        ok "Project URL: ${project_url}"
        if [[ ${open_sent} -eq 0 ]]; then
            ok "Open request sent to the desktop session."
        else
            warn "Could not auto-open the project page. Open the URL manually."
        fi
        echo
    fi
}

show_logs_block() {
    echo -e "${BOLD}Logs:${RESET}"
    dim "  PaddleOCR  → ${LOG_PADDLE}"
    dim "  Supertone  → ${LOG_SUPERTONE}"
    dim "  Kokoro     → ${LOG_KOKORO}"
    dim "  Voxtral    → ${LOG_VOXTRAL}"
    dim "  F5 TTS     → ${LOG_F5}"
    dim "  LM Studio  → ${LOG_LM}"
    dim "  OCR svc    → ${LOG_SVC_OCR}"
    dim "  TTS svc    → ${LOG_SVC_TTS}"
    dim "  Doc svc    → ${LOG_SVC_DOC}"
    dim "  Vocab svc  → ${LOG_SVC_VOCAB}"
    dim "  Agentic    → ${LOG_SVC_AGENTIC}"
    dim "  Gateway    → ${LOG_BACKEND}"
    echo
}

show_lamp_legend() {
    echo -e "${BOLD}Status lamp legend:${RESET}"
    echo "  ${LAMP_BLUE}  Selected mode fully operational"
    echo "  ${LAMP_GREEN}  PaddleOCR reachable, but one or more required services missing"
    echo "  ${LAMP_YELLOW}  Selected mode ready, but PaddleOCR is on CPU"
    echo "  ${LAMP_RED}  PaddleOCR unreachable"
    echo
}

describe_startup_order() {
    local -a steps=("PaddleOCR")

    if supertone_required_in_mode; then
        steps+=("Supertone/Piper")
    fi
    if kokoro_required_in_mode; then
        steps+=("Kokoro")
    fi
    if voxtral_required_in_mode; then
        steps+=("Voxtral")
    fi
    if f5_auto_start_enabled; then
        steps+=("F5 TTS")
    fi
    if mode_includes_lm; then
        steps+=("LM Studio")
    fi
    if mode_includes_backend; then
        steps+=("OCR/TTS/Document/Vocabulary services" "Gateway")
    fi

    join_by " -> " "${steps[@]}"
}

start_mode_stack() {
    local requested_mode="${1:-}"

    ensure_dirs

    if [[ -z "${requested_mode}" ]]; then
        fail "Launcher mode is required."
        return 1
    fi
    assign_mode "${requested_mode}"

    header "OCR App — Reset"
    log "Force-stopping previous project services and occupied ports..."
    global_cleanup
    write_state
    echo

    show_config_block
    log "Startup order: $(describe_startup_order)"
    echo

    if [[ "${ACTIVE_MODE}" == "all" ]]; then
        echo -e "${BOLD}[preflight] User confirmation${RESET}"
        if ! confirm_all_vram_readiness; then
            rollback_startup "ALL startup cancelled before VRAM confirmation."
            return 1
        fi

        echo -e "${BOLD}[0/3] VRAM Guard${RESET}"
        if ! check_vram_guard; then
            rollback_startup "VRAM precheck failed."
            return 1
        fi
        echo
    fi

    echo -e "${BOLD}[1/3] Sidecars${RESET}"
    dim "Step 1a: PaddleOCR"
    if ! start_paddleocr; then
        rollback_startup "PaddleOCR failed to start."
        return 1
    fi

    if mode_includes_tts; then
        if supertone_required_in_mode; then
            dim "Step 1b: Supertone"
            if ! start_supertone; then
                rollback_startup "Supertone failed to start."
                return 1
            fi
        else
            dim "Supertone/Piper disabled in ${TTS_MODELS_CONFIG_FILE}."
        fi
    else
        dim "Supertone and F5 skipped in OCR mode."
    fi

    if mode_includes_kokoro; then
        if kokoro_required_in_mode; then
            dim "Step 1c: Kokoro"
            if ! start_kokoro; then
                rollback_startup "Kokoro failed to start."
                return 1
            fi
        else
            dim "Kokoro disabled in ${TTS_MODELS_CONFIG_FILE}."
        fi
    else
        dim "Kokoro skipped in ${ACTIVE_MODE_LABEL} mode."
    fi

    if mode_includes_tts; then
        if voxtral_required_in_mode; then
            dim "Step 1d: Voxtral"
            start_voxtral_optional
        else
            dim "Voxtral disabled in ${TTS_MODELS_CONFIG_FILE}."
        fi
        if f5_auto_start_enabled; then
            dim "Step 1e: F5 TTS (optional manual override)"
            if ! start_f5; then
                rollback_startup "F5 TTS failed to start."
                return 1
            fi
        elif f5_launcher_enabled; then
            dim "F5 TTS enabled but auto-start disabled."
        else
            dim "F5 TTS disabled in ${TTS_MODELS_CONFIG_FILE}."
        fi
    fi
    echo

    echo -e "${BOLD}[2/3] LM Studio${RESET}"
    if mode_includes_lm; then
        if ! start_lm_studio_server; then
            rollback_startup "LM Studio server failed to start."
            return 1
        fi
        if ! load_lm_model; then
            rollback_startup "LM Studio model ${LM_MODEL_ID} failed to load."
            return 1
        fi
    else
        dim "LM Studio skipped in TTS mode."
    fi
    echo

    echo -e "${BOLD}[3/3] API stack${RESET}"
    if mode_includes_backend; then
        if ! start_backend; then
            rollback_startup "API stack failed to start."
            return 1
        fi
    else
        dim "API stack skipped in ${ACTIVE_MODE_LABEL} mode."
    fi
    echo

    show_backend_link_block
    show_logs_block
    show_lamp_legend
    return 0
}

cmd_start() {
    local requested_mode="${1:-}"

    ensure_dirs
    trap cleanup INT TERM

    if ! start_mode_stack "${requested_mode}"; then
        exit 1
    fi

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
    local requested_mode="${1:-}"
    ensure_dirs
    read_state
    apply_requested_mode_if_unset "${requested_mode}"

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
            if port_has_listener "${LM_PORT}"; then
                ok "LM Studio server listening on ${LM_PORT}"
            else
                fail "LM Studio server stopped"
            fi
            if kokoro_required_in_mode; then
                show_process_state "Kokoro" "${PID_KOKORO}" "${KOKORO_PORT_CFG}"
            else
                show_disabled_service "Kokoro"
            fi
            show_process_state "OCR service" "${PID_SVC_OCR}" "${OCR_SERVICE_PORT}"
            show_process_state "TTS service" "${PID_SVC_TTS}" "${TTS_SERVICE_PORT}"
            show_process_state "Document service" "${PID_SVC_DOC}" "${DOCUMENT_SERVICE_PORT}"
            show_process_state "Vocabulary service" "${PID_SVC_VOCAB}" "${VOCABULARY_SERVICE_PORT}"
            show_process_state "Gateway" "${PID_BACKEND}" "${APP_PORT}"
            ;;
        tts)
            if supertone_required_in_mode; then
                show_process_state "Supertone" "${PID_SUPERTONE}" "${SUPERTONE_PORT_CFG}"
                dim "Piper runs inside the Supertone sidecar"
            else
                show_disabled_service "Supertone"
                show_disabled_service "Piper"
            fi
            if kokoro_required_in_mode; then
                show_process_state "Kokoro" "${PID_KOKORO}" "${KOKORO_PORT_CFG}"
            else
                show_disabled_service "Kokoro"
            fi
            if voxtral_required_in_mode; then
                show_process_state "Voxtral" "${PID_VOXTRAL}" "${VOXTRAL_PORT_CFG}"
            else
                show_disabled_service "Voxtral"
            fi
            if f5_auto_start_enabled; then
                show_process_state "F5 TTS" "${PID_F5}" "${F5_PORT_CFG}"
            elif f5_launcher_enabled; then
                dim "F5 TTS enabled but auto-start disabled (${F5_HOST_CFG}:${F5_PORT_CFG})"
            else
                show_disabled_service "F5 TTS"
            fi
            show_process_state "OCR service" "${PID_SVC_OCR}" "${OCR_SERVICE_PORT}"
            show_process_state "TTS service" "${PID_SVC_TTS}" "${TTS_SERVICE_PORT}"
            show_process_state "Document service" "${PID_SVC_DOC}" "${DOCUMENT_SERVICE_PORT}"
            show_process_state "Vocabulary service" "${PID_SVC_VOCAB}" "${VOCABULARY_SERVICE_PORT}"
            show_process_state "Gateway" "${PID_BACKEND}" "${APP_PORT}"
            ;;
        *)
            if port_has_listener "${LM_PORT}"; then
                ok "LM Studio server listening on ${LM_PORT}"
            else
                fail "LM Studio server stopped"
            fi
            if supertone_required_in_mode; then
                show_process_state "Supertone" "${PID_SUPERTONE}" "${SUPERTONE_PORT_CFG}"
                dim "Piper runs inside the Supertone sidecar"
            else
                show_disabled_service "Supertone"
                show_disabled_service "Piper"
            fi
            if kokoro_required_in_mode; then
                show_process_state "Kokoro" "${PID_KOKORO}" "${KOKORO_PORT_CFG}"
            else
                show_disabled_service "Kokoro"
            fi
            if voxtral_required_in_mode; then
                show_process_state "Voxtral" "${PID_VOXTRAL}" "${VOXTRAL_PORT_CFG}"
            else
                show_disabled_service "Voxtral"
            fi
            if f5_auto_start_enabled; then
                show_process_state "F5 TTS" "${PID_F5}" "${F5_PORT_CFG}"
            elif f5_launcher_enabled; then
                dim "F5 TTS enabled but auto-start disabled (${F5_HOST_CFG}:${F5_PORT_CFG})"
            else
                show_disabled_service "F5 TTS"
            fi
            show_process_state "OCR service" "${PID_SVC_OCR}" "${OCR_SERVICE_PORT}"
            show_process_state "TTS service" "${PID_SVC_TTS}" "${TTS_SERVICE_PORT}"
            show_process_state "Document service" "${PID_SVC_DOC}" "${DOCUMENT_SERVICE_PORT}"
            show_process_state "Vocabulary service" "${PID_SVC_VOCAB}" "${VOCABULARY_SERVICE_PORT}"
            if [[ -n "${OPENAI_API_KEY:-}" ]]; then
                show_process_state "Agentic service" "${PID_SVC_AGENTIC}" "${AGENTIC_SERVICE_PORT}"
            else
                dim "Agentic service skipped (OPENAI_API_KEY not set)"
            fi
            show_process_state "Gateway" "${PID_BACKEND}" "${APP_PORT}"
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

ocr_main() {
    local requested_mode="${1:-}"
    shift || true

    case "${1:-start}" in
        start)  cmd_start "${requested_mode}" ;;
        stop)   cmd_stop   ;;
        wipe)   cmd_wipe   ;;
        status) cmd_status "${requested_mode}" ;;
        *)
            echo
            echo -e "  Usage: ${BOLD}$(basename "$0") [start|stop|wipe|status]${RESET}"
            echo
            echo "    (no args)    — start the dedicated mode for this launcher and monitor"
            echo "    start        — same as above"
            echo "    stop         — stop all known project services and clear ports"
            echo "    status       — show mode-aware health and process state"
            echo "    wipe         — stop everything + remove build artifacts"
            echo
            exit 1
            ;;
    esac
}
