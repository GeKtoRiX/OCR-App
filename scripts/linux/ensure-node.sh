#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

NODE_VERSION="${NODE_VERSION:-v22.22.1}"
NODE_DIST_DIR="${ROOT_DIR}/.tools"
NODE_DIR="${NODE_DIST_DIR}/node"
NODE_ARCHIVE="node-${NODE_VERSION}-linux-x64.tar.xz"
NODE_URL="${NODE_URL:-https://nodejs.org/dist/${NODE_VERSION}/${NODE_ARCHIVE}}"

mkdir -p "${NODE_DIST_DIR}"

exec 9>"${NODE_DIST_DIR}/.node-install.lock"
flock 9

if [[ ! -x "${NODE_DIR}/bin/node" ]]; then
  ARCHIVE_PATH="${NODE_DIST_DIR}/${NODE_ARCHIVE}"
  EXTRACTED_DIR="${NODE_DIST_DIR}/node-${NODE_VERSION}-linux-x64"

  rm -rf "${EXTRACTED_DIR}"
  curl -fsSLo "${ARCHIVE_PATH}" "${NODE_URL}"
  tar -xf "${ARCHIVE_PATH}" -C "${NODE_DIST_DIR}"
  mv -f "${EXTRACTED_DIR}" "${NODE_DIR}"
  rm -f "${ARCHIVE_PATH}"
fi

printf '%s\n' "${NODE_DIR}/bin"
