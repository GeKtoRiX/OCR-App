#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

bash scripts/e2e/stop-browser-env.sh

mkdir -p tmp/test-db
rm -f tmp/test-db/browser-e2e.sqlite

bash scripts/linux/run-js-command.sh npm run build:frontend
bash scripts/linux/run-js-command.sh npm run build:backend
