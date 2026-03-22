#!/usr/bin/env bash
# OCR App — dedicated OCR launcher

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/ocr-common.sh"

ocr_main "ocr" "$@"
