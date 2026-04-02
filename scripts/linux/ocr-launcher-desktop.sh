#!/usr/bin/env bash

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${ROOT_DIR}" || exit 1

if bash scripts/linux/ocr.sh "$@"; then
    exit 0
fi

status=$?
echo
read -r -n 1 -s -p "OCR launcher exited with an error. Press any key to close..."
echo
exit "${status}"
