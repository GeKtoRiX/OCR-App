#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <python-bin> [args...]" >&2
    exit 1
fi

PYTHON_BIN="$1"
shift
PYTHON_FALLBACK_BIN="${PYTHON_FALLBACK_BIN:-python3}"
PYTHON_SITE_PACKAGES_EXTRA="${PYTHON_SITE_PACKAGES_EXTRA:-}"

join_pythonpath() {
    local result="${1:-}"
    local value="${2:-}"

    if [[ -z "${value}" ]]; then
        printf '%s\n' "${result}"
        return 0
    fi

    if [[ -z "${result}" ]]; then
        printf '%s\n' "${value}"
    else
        printf '%s:%s\n' "${result}" "${value}"
    fi
}

discover_site_packages() {
    local python_bin="$1"
    local venv_root=""
    local candidate=""

    venv_root="$(cd "$(dirname "${python_bin}")/.." && pwd 2>/dev/null || true)"
    [[ -n "${venv_root}" ]] || return 1

    for candidate in "${venv_root}"/lib/python*/site-packages; do
        if [[ -d "${candidate}" ]]; then
            printf '%s\n' "${candidate}"
            return 0
        fi
    done

    return 1
}

python_bin_works() {
    local python_bin="$1"
    [[ -x "${python_bin}" ]] || return 1
    "${python_bin}" -c 'import sys; print(sys.version)' >/dev/null 2>&1
}

SELECTED_PYTHON_BIN="${PYTHON_BIN}"
SERVICE_SITE_PACKAGES=""
if SERVICE_SITE_PACKAGES="$(discover_site_packages "${PYTHON_BIN}")"; then
    PYTHONPATH="$(join_pythonpath "${PYTHONPATH:-}" "${SERVICE_SITE_PACKAGES}")"
fi
if [[ -n "${PYTHON_SITE_PACKAGES_EXTRA}" ]]; then
    PYTHONPATH="$(join_pythonpath "${PYTHONPATH:-}" "${PYTHON_SITE_PACKAGES_EXTRA}")"
fi
if [[ -n "${PYTHONPATH:-}" ]]; then
    export PYTHONPATH
fi

if ! python_bin_works "${PYTHON_BIN}"; then
    SELECTED_PYTHON_BIN="${PYTHON_FALLBACK_BIN}"
fi

discover_torch_lib() {
    local python_bin="$1"
    local torch_lib=""

    if [[ -x "${python_bin}" ]]; then
        torch_lib="$(
            "${python_bin}" -c 'import importlib.util, pathlib; spec = importlib.util.find_spec("torch"); print((pathlib.Path(spec.origin).resolve().parent / "lib") if spec and spec.origin else "")' 2>/dev/null || true
        )"
        if [[ -n "${torch_lib}" && -d "${torch_lib}" ]]; then
            printf '%s\n' "${torch_lib}"
            return 0
        fi
    fi

    local home_torch_glob
    for home_torch_glob in "${HOME}"/.local/lib/python*/site-packages/torch/lib; do
        if [[ -d "${home_torch_glob}" ]]; then
            printf '%s\n' "${home_torch_glob}"
            return 0
        fi
    done

    return 1
}

TORCH_LIB=""
if TORCH_LIB="$(discover_torch_lib "${SELECTED_PYTHON_BIN}")"; then
    if [[ -n "${LD_LIBRARY_PATH:-}" ]]; then
        export LD_LIBRARY_PATH="${TORCH_LIB}:${LD_LIBRARY_PATH}"
    else
        export LD_LIBRARY_PATH="${TORCH_LIB}"
    fi
fi

exec "${SELECTED_PYTHON_BIN}" "$@"
