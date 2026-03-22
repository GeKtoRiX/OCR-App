#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

PORTS=(3000 8000 8100 8200 8300)

for port in "${PORTS[@]}"; do
  if fuser "${port}/tcp" >/dev/null 2>&1; then
    fuser -k "${port}/tcp" >/dev/null 2>&1 || true
  fi
done

for _ in $(seq 1 30); do
  busy=0
  for port in "${PORTS[@]}"; do
    if fuser "${port}/tcp" >/dev/null 2>&1; then
      busy=1
      break
    fi
  done

  if [[ "$busy" -eq 0 ]]; then
    exit 0
  fi

  sleep 1
done

echo "Timed out waiting for browser e2e stack ports to close" >&2
exit 1
