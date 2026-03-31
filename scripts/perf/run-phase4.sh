#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

LOG_DIR="${ROOT_DIR}/tmp/perf/logs"
mkdir -p "${LOG_DIR}"
PIDS=()

cleanup() {
  for pid in "${PIDS[@]:-}"; do
    if kill -0 "${pid}" >/dev/null 2>&1; then
      kill "${pid}" >/dev/null 2>&1 || true
      wait "${pid}" >/dev/null 2>&1 || true
    fi
  done
  bash scripts/e2e/stop-browser-env.sh >/dev/null 2>&1 || true
}

trap cleanup EXIT

bash scripts/e2e/prepare-browser-env.sh

start_bg() {
  local logfile="$1"
  shift
  nohup "$@" >"${logfile}" 2>&1 &
  PIDS+=("$!")
}

start_bg "${LOG_DIR}/supertone.log" bash -lc 'SUPERTONE_USE_GPU=false bash scripts/linux/run-python-with-torch.sh services/tts/supertone-service/.venv/bin/python -m uvicorn --app-dir services/tts/supertone-service main:app --host 0.0.0.0 --port 8100'
start_bg "${LOG_DIR}/kokoro.log" bash scripts/linux/run-js-command.sh npm run dev:kokoro
start_bg "${LOG_DIR}/svc-ocr.log" bash scripts/linux/run-js-command.sh node backend/dist/services/ocr/src/main.js
start_bg "${LOG_DIR}/svc-tts.log" bash scripts/linux/run-js-command.sh node backend/dist/services/tts/src/main.js
start_bg "${LOG_DIR}/svc-doc.log" bash -lc 'export DOCUMENTS_SQLITE_DB_PATH=tmp/test-db/documents.sqlite; bash scripts/linux/run-js-command.sh node backend/dist/services/document/src/main.js'
start_bg "${LOG_DIR}/svc-vocab.log" bash -lc 'export VOCABULARY_SQLITE_DB_PATH=tmp/test-db/vocabulary.sqlite; bash scripts/linux/run-js-command.sh node backend/dist/services/vocabulary/src/main.js'
start_bg "${LOG_DIR}/backend.log" bash -lc 'export PORT=3000; bash scripts/linux/run-js-command.sh node backend/dist/gateway/main.js'

wait_for_url() {
  local url="$1"
  local timeout="$2"
  local name="$3"
  local started
  started=$(date +%s)

  until curl -fsS "${url}" >/dev/null 2>&1; do
    if (( $(date +%s) - started >= timeout )); then
      echo "Timed out waiting for ${name} at ${url}" >&2
      return 1
    fi
    sleep 1
  done
}

wait_for_url "http://127.0.0.1:1234/v1/models" 60 "LM Studio"
wait_for_url "http://127.0.0.1:8100/health" 60 "Supertone"
wait_for_url "http://127.0.0.1:8200/health" 180 "Kokoro"
wait_for_url "http://127.0.0.1:3000/api/health" 120 "Gateway"

bash scripts/linux/run-js-command.sh node scripts/perf/api-benchmark.mjs
bash scripts/linux/run-js-command.sh node scripts/perf/browser-benchmark.mjs

echo "Phase 4 benchmarks completed."
