#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

"${SCRIPT_DIR}/run-js-command.sh" npm install
"${SCRIPT_DIR}/run-js-command.sh" npx playwright install chromium

printf 'JS tooling ready in %s\n' "${ROOT_DIR}/.tools"
