#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
NODE_BIN_DIR="$("${SCRIPT_DIR}/ensure-node.sh")"

export PATH="${NODE_BIN_DIR}:${PATH}"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-${ROOT_DIR}/.tools/playwright}"

cd "${ROOT_DIR}"
exec "$@"
