#!/usr/bin/env bash
# OCR App — shared launcher implementation
#
#  ./ocr.sh             — start OCR mode (LM Studio OCR + selected TTS sidecars + backend)
#  ./tts.sh             — start TTS mode (LM Studio OCR + selected TTS sidecars + backend)
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

SUPERTONE_VENV="${ROOT_DIR}/services/tts/supertone-service/.venv"
KOKORO_VENV="${ROOT_DIR}/services/tts/kokoro-service/.venv"
STANZA_VENV="${ROOT_DIR}/services/nlp/stanza-service/.venv"
BERT_VENV="${ROOT_DIR}/services/nlp/bert-service/.venv"

PID_DIR="${ROOT_DIR}/.pids"
PID_SUPERTONE="${PID_DIR}/supertone.pid"
PID_KOKORO="${PID_DIR}/kokoro.pid"
PID_STANZA="${PID_DIR}/stanza.pid"
PID_BERT="${PID_DIR}/bert.pid"
PID_BACKEND="${PID_DIR}/backend.pid"
PID_SVC_OCR="${PID_DIR}/svc-ocr.pid"
PID_SVC_TTS="${PID_DIR}/svc-tts.pid"
PID_SVC_DOC="${PID_DIR}/svc-doc.pid"
PID_SVC_VOCAB="${PID_DIR}/svc-vocab.pid"
PID_SVC_AGENTIC="${PID_DIR}/svc-agentic.pid"
STATE_FILE="${PID_DIR}/ocr-launcher.state"

LOG_DIR="${ROOT_DIR}/logs"
LOG_SUPERTONE="${LOG_DIR}/supertone.log"
LOG_KOKORO="${LOG_DIR}/kokoro.log"
LOG_STANZA="${LOG_DIR}/stanza.log"
LOG_BERT="${LOG_DIR}/bert.log"
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

SUPERTONE_HOST_CFG="${SUPERTONE_HOST:-localhost}"
SUPERTONE_PORT_CFG="${SUPERTONE_PORT:-8100}"

KOKORO_HOST_CFG="${KOKORO_HOST:-localhost}"
KOKORO_PORT_CFG="${KOKORO_PORT:-8200}"
TTS_ENABLE_SUPERTONE_CFG="${TTS_ENABLE_SUPERTONE:-false}"
TTS_ENABLE_KOKORO_CFG="${TTS_ENABLE_KOKORO:-false}"

STANZA_HOST_CFG="${STANZA_HOST:-localhost}"
STANZA_PORT_CFG="${STANZA_PORT:-8501}"

BERT_HOST_CFG="${BERT_HOST:-localhost}"
BERT_PORT_CFG="${BERT_PORT:-8502}"

VITE_PORT="${VITE_PORT:-5173}"
PROJECT_PORTS=("${APP_PORT}" "${OCR_SERVICE_PORT}" "${TTS_SERVICE_PORT}" "${DOCUMENT_SERVICE_PORT}" "${VOCABULARY_SERVICE_PORT}" "${AGENTIC_SERVICE_PORT}" "${VITE_PORT}" "${SUPERTONE_PORT_CFG}" "${KOKORO_PORT_CFG}" "${STANZA_PORT_CFG}" "${BERT_PORT_CFG}")

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
    local preferred_root="${1:-}"
    local candidate=""

    if [[ -n "${preferred_root}" ]]; then
        for candidate in "${preferred_root}"/lib/python*/site-packages/torch/lib; do
            if [[ -d "${candidate}" ]]; then
                echo "${candidate}"
                return 0
            fi
        done
    fi

    for candidate in "${HOME}"/.local/lib/python*/site-packages/torch/lib; do
        if [[ -d "${candidate}" ]]; then
            echo "${candidate}"
            return 0
        fi
    done

    echo ""
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

supertone_required_in_mode() {
    mode_includes_tts && supertone_launcher_enabled
}

kokoro_required_in_mode() {
    mode_includes_kokoro && kokoro_launcher_enabled
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
    kill_by_pattern "Supertone" "${ROOT_DIR}/services/tts/supertone-service"
    kill_by_pattern "Supertone" "services/tts/supertone-service"
    kill_by_pattern "Kokoro" "${ROOT_DIR}/services/tts/kokoro-service"
    kill_by_pattern "Kokoro" "services/tts/kokoro-service"
    kill_by_pattern "Stanza NLP" "${ROOT_DIR}/services/nlp/stanza-service"
    kill_by_pattern "Stanza NLP" "services/nlp/stanza-service"
    kill_by_pattern "BERT scorer" "${ROOT_DIR}/services/nlp/bert-service"
    kill_by_pattern "BERT scorer" "services/nlp/bert-service"
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
    stop_service "Kokoro" "${PID_KOKORO}"
    stop_service "Stanza NLP" "${PID_STANZA}"
    stop_service "Supertone" "${PID_SUPERTONE}"

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

check_ocr_engine() {
    check_lm_studio && check_lm_model_loaded
}

fetch_ocr_device() {
    echo "unknown"
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

check_stanza() {
    local json
    json=$(probe_json "http://${STANZA_HOST_CFG}:${STANZA_PORT_CFG}/health") || return 1
    echo "${json}" | python3 -c 'import json,sys; d=json.load(sys.stdin); raise SystemExit(0 if d.get("pipelineReady") is True else 1)'
}

check_bert() {
    local json
    json=$(probe_json "http://${BERT_HOST_CFG}:${BERT_PORT_CFG}/health") || return 1
    echo "${json}" | python3 -c 'import json,sys; d=json.load(sys.stdin); raise SystemExit(0 if d.get("modelReady") is True else 1)'
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
ensure_ocr_engine_ready() {
    if ! mode_includes_lm; then
        dim "LM Studio check skipped in ${ACTIVE_MODE_LABEL} mode."
        return 0
    fi

    if ! check_lm_studio; then
        warn "LM Studio is not reachable at ${LM_URL}"
        warn "Start LM Studio manually, then rerun: $0 start ${ACTIVE_MODE}"
        return 1
    fi

    ok "LM Studio server reachable"
    return 0
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

    torch_lib=$(resolve_torch_lib "${SUPERTONE_VENV}")

    log "Starting Supertone TTS sidecar (port ${SUPERTONE_PORT_CFG})..."
    env SUPERTONE_USE_GPU=true \
        LD_LIBRARY_PATH="${torch_lib:+${torch_lib}:}${LD_LIBRARY_PATH:-}" \
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

    torch_lib=$(resolve_torch_lib "${KOKORO_VENV}")

    log "Starting Kokoro TTS sidecar (port ${KOKORO_PORT_CFG})..."
    dim "Kokoro log file: ${LOG_KOKORO}"
    env KOKORO_USE_GPU=false \
        LD_LIBRARY_PATH="${torch_lib:+${torch_lib}:}${LD_LIBRARY_PATH:-}" \
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

start_stanza() {
    if check_stanza; then
        ok "Stanza NLP already reachable"
        return 0
    fi

    if is_running "${PID_STANZA}"; then
        ok "Stanza NLP already running (PID $(cat "${PID_STANZA}"))"
        return 0
    fi

    if [[ ! -f "${STANZA_VENV}/bin/python" ]]; then
        warn "Stanza venv not found at ${STANZA_VENV}"
        warn "Run: cd services/nlp/stanza-service && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
        return 1
    fi

    log "Starting Stanza NLP sidecar (port ${STANZA_PORT_CFG})..."
    dim "Stanza log file: ${LOG_STANZA}"
    env STANZA_USE_GPU="${STANZA_USE_GPU:-true}" \
        STANZA_MODEL_DIR="${ROOT_DIR}/services/nlp/stanza-service/models" \
        "${STANZA_VENV}/bin/python" -m uvicorn \
        --app-dir "${ROOT_DIR}/services/nlp/stanza-service" main:app \
        --host 0.0.0.0 --port "${STANZA_PORT_CFG}" \
        > "${LOG_STANZA}" 2>&1 &
    echo $! > "${PID_STANZA}"
    dim "Stanza process launched with PID $(cat "${PID_STANZA}")"

    if wait_for_check "Stanza NLP (loading models)" 90 check_stanza; then
        ok "Stanza NLP ready (PID $(cat "${PID_STANZA}"))"
        return 0
    fi

    warn "Stanza NLP did not respond — vocabulary extraction will use heuristic fallback. Check ${LOG_STANZA}"
    return 0
}

start_bert() {
    if check_bert; then
        ok "BERT scorer already reachable"
        return 0
    fi

    if is_running "${PID_BERT}"; then
        ok "BERT scorer already running (PID $(cat "${PID_BERT}"))"
        return 0
    fi

    if [[ ! -f "${BERT_VENV}/bin/python" ]]; then
        warn "BERT venv not found at ${BERT_VENV}"
        warn "Run: cd services/nlp/bert-service && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
        return 1
    fi

    log "Starting BERT scorer sidecar (port ${BERT_PORT_CFG})..."
    dim "BERT log file: ${LOG_BERT}"
    env BERT_MODEL_NAME="${BERT_MODEL_NAME:-bert-large-cased}" \
        BERT_USE_GPU="${BERT_USE_GPU:-true}" \
        BERT_MODEL_DIR="${ROOT_DIR}/services/nlp/bert-service/models" \
        bash "${ROOT_DIR}/scripts/linux/run-python-with-torch.sh" \
        "${BERT_VENV}/bin/python" -m uvicorn \
        --app-dir "${ROOT_DIR}/services/nlp/bert-service" main:app \
        --host 0.0.0.0 --port "${BERT_PORT_CFG}" \
        > "${LOG_BERT}" 2>&1 &
    echo $! > "${PID_BERT}"
    dim "BERT process launched with PID $(cat "${PID_BERT}")"

    if wait_for_check "BERT scorer (loading model)" 120 check_bert; then
        ok "BERT scorer ready (PID $(cat "${PID_BERT}"))"
        return 0
    fi

    warn "BERT scorer did not respond — vocabulary scoring will be skipped. Check ${LOG_BERT}"
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

    dim "Loading LM Studio model: ${LM_MODEL_ID}"
    if lms_cli_available; then
        lms_cmd load "${LM_MODEL_ID}" >/dev/null 2>&1 || true
    else
        local encoded
        encoded=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "${LM_MODEL_ID}")
        curl -sf -X POST "${LM_BASE_URL}/api/v0/models/${encoded}/load" \
            -H "Content-Type: application/json" -d '{}' >/dev/null 2>&1 || true
    fi

    if wait_for_check "LM Studio model ${LM_MODEL_ID}" 120 check_lm_model_loaded; then
        ok "LM Studio model loaded (${LM_MODEL_ID})"
        return 0
    fi

    warn "LM Studio model failed to load: ${LM_MODEL_ID}"
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
    local ocr_ok=0
    local lm_ok=0
    local supertone_ok=0
    local piper_ok=0
    local kokoro_ok=0
    local backend_ok=0
    local supertone_enabled=0
    local piper_enabled=0
    local kokoro_enabled=0
    local ocr_kokoro_ready=1
    local tts_supertone_ready=1
    local tts_piper_ready=1
    local tts_kokoro_ready=1
    local all_supertone_ready=1
    local all_piper_ready=1
    local all_kokoro_ready=1
    local ocr_device="unknown"

    if check_ocr_engine; then
        ocr_ok=1
        ocr_device=$(fetch_ocr_device 2>/dev/null || echo "unknown")
    fi

    check_backend   && backend_ok=1 || true
    check_supertone && supertone_ok=1 || true
    check_piper     && piper_ok=1 || true
    check_kokoro    && kokoro_ok=1 || true
    check_lm_model_loaded && lm_ok=1 || true

    supertone_required_in_mode && supertone_enabled=1 || true
    supertone_required_in_mode && piper_enabled=1 || true
    kokoro_required_in_mode && kokoro_enabled=1 || true

    [[ ${kokoro_enabled} -eq 1 ]] && ocr_kokoro_ready=${kokoro_ok}
    [[ ${supertone_enabled} -eq 1 ]] && tts_supertone_ready=${supertone_ok}
    [[ ${piper_enabled} -eq 1 ]] && tts_piper_ready=${piper_ok}
    [[ ${kokoro_enabled} -eq 1 ]] && tts_kokoro_ready=${kokoro_ok}
    [[ ${supertone_enabled} -eq 1 ]] && all_supertone_ready=${supertone_ok}
    [[ ${piper_enabled} -eq 1 ]] && all_piper_ready=${piper_ok}
    [[ ${kokoro_enabled} -eq 1 ]] && all_kokoro_ready=${kokoro_ok}

    if [[ ${ocr_ok} -eq 0 ]]; then
        echo "${LAMP_RED}  OCR model unavailable"
        return
    fi

    case "${mode}" in
        ocr)
            if [[ ${backend_ok} -eq 1 && ${lm_ok} -eq 1 && ${ocr_kokoro_ready} -eq 1 ]]; then
                echo "${LAMP_BLUE}  OCR mode ready | OCR model ✓ | LM Studio ✓ | $(service_lamp_part "Kokoro" "${kokoro_enabled}" "${kokoro_ok}") | Gateway ✓"
            else
                echo "${LAMP_GREEN}  OCR mode partial | OCR model ${ocr_device} | LM Studio $(status_marker "${lm_ok}") | $(service_lamp_part "Kokoro" "${kokoro_enabled}" "${kokoro_ok}") | Gateway $(status_marker "${backend_ok}")"
            fi
            ;;
        tts)
            if [[ ${backend_ok} -eq 1 && ${tts_supertone_ready} -eq 1 && ${tts_piper_ready} -eq 1 && ${tts_kokoro_ready} -eq 1 ]]; then
                echo "${LAMP_BLUE}  TTS mode ready | OCR model ✓ | $(service_lamp_part "Supertone" "${supertone_enabled}" "${supertone_ok}") | $(service_lamp_part "Piper" "${piper_enabled}" "${piper_ok}") | $(service_lamp_part "Kokoro" "${kokoro_enabled}" "${kokoro_ok}") | Gateway ✓"
            else
                echo "${LAMP_GREEN}  TTS mode partial | OCR model ${ocr_device} | $(service_lamp_part "Supertone" "${supertone_enabled}" "${supertone_ok}") | $(service_lamp_part "Piper" "${piper_enabled}" "${piper_ok}") | $(service_lamp_part "Kokoro" "${kokoro_enabled}" "${kokoro_ok}") | Gateway $(status_marker "${backend_ok}")"
            fi
            ;;
        *)
            if [[ ${backend_ok} -eq 1 && ${lm_ok} -eq 1 && ${all_supertone_ready} -eq 1 && ${all_piper_ready} -eq 1 && ${all_kokoro_ready} -eq 1 ]]; then
                echo "${LAMP_BLUE}  All mode ready | OCR model ✓ | LM Studio ✓ | $(service_lamp_part "Supertone" "${supertone_enabled}" "${supertone_ok}") | $(service_lamp_part "Piper" "${piper_enabled}" "${piper_ok}") | $(service_lamp_part "Kokoro" "${kokoro_enabled}" "${kokoro_ok}") | Gateway ✓"
            else
                echo "${LAMP_GREEN}  All mode partial | OCR model ${ocr_device} | LM Studio $(status_marker "${lm_ok}") | $(service_lamp_part "Supertone" "${supertone_enabled}" "${supertone_ok}") | $(service_lamp_part "Piper" "${piper_enabled}" "${piper_ok}") | $(service_lamp_part "Kokoro" "${kokoro_enabled}" "${kokoro_ok}") | Gateway $(status_marker "${backend_ok}")"
            fi
            ;;
    esac
}

show_health_block() {
    local mode="${1:-${ACTIVE_MODE:-all}}"

    check_ocr_engine && ok "OCR model (${LM_MODEL_ID})" || warn "OCR model unavailable"

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
    echo "  OCR model      : ${LM_MODEL_ID}"
    echo "  Supertone      : ${SUPERTONE_HOST_CFG}:${SUPERTONE_PORT_CFG}"
    echo "  Kokoro         : ${KOKORO_HOST_CFG}:${KOKORO_PORT_CFG}"
    echo "  Launch TTS     : supertone=$(supertone_launcher_enabled && echo on || echo off), kokoro=$(kokoro_launcher_enabled && echo on || echo off)"
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
    dim "  Supertone  → ${LOG_SUPERTONE}"
    dim "  Kokoro     → ${LOG_KOKORO}"
    dim "  Stanza NLP → ${LOG_STANZA}"
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
    echo "  ${LAMP_GREEN}  OCR model ready, but one or more required services missing"
    echo "  ${LAMP_YELLOW}  Reserved for degraded runtime checks"
    echo "  ${LAMP_RED}  OCR model unavailable"
    echo
}

describe_startup_order() {
    local -a steps=("OCR model")

    if supertone_required_in_mode; then
        steps+=("Supertone/Piper")
    fi
    if kokoro_required_in_mode; then
        steps+=("Kokoro")
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
    dim "Step 1a: OCR model"
    if ! ensure_ocr_engine_ready; then
        rollback_startup "OCR model is not ready."
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
        dim "Supertone skipped in OCR mode."
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

    if mode_includes_backend; then
        dim "Step 1d: Stanza NLP"
        start_stanza || true
        dim "Step 1e: BERT scorer"
        start_bert || true
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
    if check_lm_studio; then
        ok "LM Studio server listening on ${LM_PORT}"
    else
        fail "LM Studio server stopped"
    fi
    if check_lm_model_loaded; then
        ok "OCR model loaded (${LM_MODEL_ID})"
    else
        fail "OCR model not loaded (${LM_MODEL_ID})"
    fi

    case "${ACTIVE_MODE:-all}" in
        ocr)
            if kokoro_required_in_mode; then
                show_process_state "Kokoro" "${PID_KOKORO}" "${KOKORO_PORT_CFG}"
            else
                show_disabled_service "Kokoro"
            fi
            show_process_state "Stanza NLP" "${PID_STANZA}" "${STANZA_PORT_CFG}"
            show_process_state "BERT scorer" "${PID_BERT}" "${BERT_PORT_CFG}"
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
            show_process_state "Stanza NLP" "${PID_STANZA}" "${STANZA_PORT_CFG}"
            show_process_state "BERT scorer" "${PID_BERT}" "${BERT_PORT_CFG}"
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
            show_process_state "Stanza NLP" "${PID_STANZA}" "${STANZA_PORT_CFG}"
            show_process_state "BERT scorer" "${PID_BERT}" "${BERT_PORT_CFG}"
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
