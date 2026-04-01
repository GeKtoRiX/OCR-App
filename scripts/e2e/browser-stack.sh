#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

MODE="${E2E_STACK_MODE:-full}"
LOG_DIR="${ROOT_DIR}/tmp/e2e-logs"
LM_STUDIO_BASE_URL="${LM_STUDIO_BASE_URL:-http://127.0.0.1:1234/v1}"
LM_STUDIO_MODELS_URL="${LM_STUDIO_BASE_URL%/}/models"
mkdir -p "${LOG_DIR}" "${ROOT_DIR}/tmp/test-db"

PIDS=()

start_bg() {
  local logfile="$1"
  shift
  nohup "$@" >"${logfile}" 2>&1 &
  PIDS+=("$!")
}

is_port_listening() {
  local port="$1"
  bash -lc "exec 3<>/dev/tcp/127.0.0.1/${port}" >/dev/null 2>&1
}

wait_for_port() {
  local port="$1"
  local timeout="$2"
  local name="$3"
  local started
  started=$(date +%s)

  until is_port_listening "${port}"; do
    if (( $(date +%s) - started >= timeout )); then
      echo "Timed out waiting for ${name} on port ${port}. Logs: ${LOG_DIR}" >&2
      return 1
    fi
    sleep 1
  done
}

wait_for_url() {
  local url="$1"
  local timeout="$2"
  local name="$3"
  local started
  started=$(date +%s)

  until curl -fsS "${url}" >/dev/null 2>&1; do
    if (( $(date +%s) - started >= timeout )); then
      echo "Timed out waiting for ${name} at ${url}. Logs: ${LOG_DIR}" >&2
      return 1
    fi
    sleep 1
  done
}

cleanup() {
  for pid in "${PIDS[@]:-}"; do
    if kill -0 "${pid}" >/dev/null 2>&1; then
      kill "${pid}" >/dev/null 2>&1 || true
      wait "${pid}" >/dev/null 2>&1 || true
    fi
  done

  bash scripts/e2e/stop-browser-env.sh >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

bash scripts/e2e/stop-browser-env.sh >/dev/null 2>&1 || true

case "${MODE}" in
  full)
    wait_for_url "${LM_STUDIO_MODELS_URL}" 30 "LM Studio"
    start_bg "${LOG_DIR}/svc-ocr.log" bash -lc \
      'export LM_STUDIO_SMOKE_ONLY=true; bash scripts/linux/run-js-command.sh node backend/dist/services/ocr/src/main.js'
    start_bg "${LOG_DIR}/svc-tts.log" bash -lc \
      'bash scripts/linux/run-js-command.sh node backend/dist/services/tts/src/main.js'
    start_bg "${LOG_DIR}/svc-doc.log" bash -lc \
      'export LM_STUDIO_SMOKE_ONLY=true DOCUMENTS_SQLITE_DB_PATH=tmp/test-db/documents.sqlite; bash scripts/linux/run-js-command.sh node backend/dist/services/document/src/main.js'
    start_bg "${LOG_DIR}/svc-vocab.log" bash -lc \
      'export LM_STUDIO_SMOKE_ONLY=true VOCABULARY_SQLITE_DB_PATH=tmp/test-db/vocabulary.sqlite; bash scripts/linux/run-js-command.sh node backend/dist/services/vocabulary/src/main.js'
    wait_for_port 3901 120 "OCR service"
    wait_for_port 3902 120 "TTS service"
    wait_for_port 3903 120 "Document service"
    wait_for_port 3904 120 "Vocabulary service"
    ;;
  vocab)
    start_bg "${LOG_DIR}/svc-doc.log" bash -lc \
      'export LM_STUDIO_SMOKE_ONLY=true DOCUMENTS_SQLITE_DB_PATH=tmp/test-db/documents.sqlite; bash scripts/linux/run-js-command.sh node backend/dist/services/document/src/main.js'
    start_bg "${LOG_DIR}/svc-vocab.log" bash -lc \
      'export LM_STUDIO_SMOKE_ONLY=true VOCABULARY_SQLITE_DB_PATH=tmp/test-db/vocabulary.sqlite; bash scripts/linux/run-js-command.sh node backend/dist/services/vocabulary/src/main.js'
    wait_for_port 3903 120 "Document service"
    wait_for_port 3904 120 "Vocabulary service"
    ;;
  *)
    echo "Unsupported E2E_STACK_MODE=${MODE}. Expected full or vocab." >&2
    exit 1
    ;;
esac

start_bg "${LOG_DIR}/gateway.log" bash -lc \
  'export PORT=3000; bash scripts/linux/run-js-command.sh node backend/dist/gateway/main.js'

wait_for_url "http://127.0.0.1:3000/api/health" 120 "Gateway"

while true; do
  sleep 1
done
