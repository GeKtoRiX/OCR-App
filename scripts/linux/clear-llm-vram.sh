#!/usr/bin/env bash
# OCR App — free VRAM held by user-owned LLM workloads

set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
CURRENT_USER="$(id -un)"
LM_CLI_BIN="${LM_CLI_BIN:-${HOME}/.lmstudio/bin/lms}"

declare -a TERMINATED_PIDS=()
declare -a TERMINATED_LABELS=()

bytes_to_gib() {
    awk -v bytes="${1}" 'BEGIN { printf "%.2f GiB", bytes / 1073741824 }'
}

percent_str() {
    local used="${1}"
    local total="${2}"
    awk -v used="${used}" -v total="${total}" 'BEGIN {
        if (total <= 0) {
            printf "0.0%%"
        } else {
            printf "%.1f%%", (used / total) * 100
        }
    }'
}

print_line() {
    printf '%-16s %s\n' "${1}" "${2}"
}

read_vram_rocm_smi() {
    local json_output
    local total
    local used

    json_output="$(rocm-smi --showmeminfo vram --json 2>/dev/null || true)"
    if [[ -n "${json_output}" ]]; then
        total="$(printf '%s\n' "${json_output}" | grep -oE '"VRAM Total Memory \(B\)": "[0-9]+"' | head -n1 | grep -oE '[0-9]+' | head -n1 || true)"
        used="$(printf '%s\n' "${json_output}" | grep -oE '"VRAM Total Used Memory \(B\)": "[0-9]+"' | head -n1 | grep -oE '[0-9]+' | head -n1 || true)"
        if [[ -n "${total}" && -n "${used}" ]]; then
            printf '%s %s rocm-smi\n' "${total}" "${used}"
            return 0
        fi
    fi

    local text_output
    text_output="$(rocm-smi --showmeminfo vram 2>/dev/null || true)"
    total="$(printf '%s\n' "${text_output}" | awk -F': ' '/VRAM Total Memory \(B\)/ {print $2; exit}')"
    used="$(printf '%s\n' "${text_output}" | awk -F': ' '/VRAM Total Used Memory \(B\)/ {print $2; exit}')"
    if [[ -n "${total}" && -n "${used}" ]]; then
        printf '%s %s rocm-smi\n' "${total}" "${used}"
        return 0
    fi

    return 1
}

read_vram_sysfs() {
    local total_file
    local used_file

    for total_file in /sys/class/drm/card*/device/mem_info_vram_total; do
        [[ -f "${total_file}" ]] || continue
        used_file="${total_file%_total}_used"
        [[ -f "${used_file}" ]] || continue
        printf '%s %s sysfs\n' "$(cat "${total_file}")" "$(cat "${used_file}")"
        return 0
    done

    return 1
}

read_vram_metrics() {
    if command -v rocm-smi >/dev/null 2>&1; then
        read_vram_rocm_smi && return 0
    fi

    read_vram_sysfs && return 0

    echo "Could not read VRAM metrics from rocm-smi or /sys/class/drm." >&2
    exit 1
}

lmstudio_models_loaded() {
    [[ -x "${LM_CLI_BIN}" ]] || return 1

    local json_output
    json_output="$("${LM_CLI_BIN}" ps --json 2>/dev/null || true)"
    [[ -n "${json_output}" ]] || return 1
    printf '%s\n' "${json_output}" | grep -qE '"identifier"|"modelKey"|"id"'
}

lmstudio_loaded_model_count() {
    [[ -x "${LM_CLI_BIN}" ]] || {
        echo 0
        return 0
    }

    local json_output
    json_output="$("${LM_CLI_BIN}" ps --json 2>/dev/null || true)"
    [[ -n "${json_output}" ]] || {
        echo 0
        return 0
    }

    printf '%s\n' "${json_output}" | grep -oE '"identifier"|"modelKey"|"id"' | wc -l | tr -d ' '
}

stop_lmstudio() {
    LM_MODELS_UNLOADED=0
    LM_SERVER_STOPPED=0

    [[ -x "${LM_CLI_BIN}" ]] || return 0

    if lmstudio_models_loaded; then
        LM_MODELS_UNLOADED="$(lmstudio_loaded_model_count)"
        if "${LM_CLI_BIN}" unload --all >/dev/null 2>&1; then
            :
        else
            LM_MODELS_UNLOADED=0
        fi
    fi

    if "${LM_CLI_BIN}" server status 2>/dev/null | grep -q 'Server:[[:space:]]*ON'; then
        if "${LM_CLI_BIN}" server stop >/dev/null 2>&1; then
            LM_SERVER_STOPPED=1
        fi
    fi
}

should_skip_process() {
    local pid="${1}"
    local comm="${2}"
    local args="${3}"

    [[ "${pid}" -eq "$$" ]] && return 0
    [[ "${pid}" -eq "${PPID}" ]] && return 0
    [[ "${args}" == *"${SCRIPT_NAME}"* ]] && return 0

    case "${comm,,}" in
        mutter*|gnome-shell|xwayland|xdg-desktop-*|code|code-insiders|firefox|chrome|chromium|brave|kitty|gnome-terminal-*|ptyxis*|bash|zsh|fish|sh|tmux|screen)
            return 0
            ;;
    esac

    return 1
}

collect_candidate_processes() {
    ps -u "${CURRENT_USER}" -o pid=,comm=,args= | while read -r pid comm args; do
        [[ -n "${pid}" ]] || continue
        should_skip_process "${pid}" "${comm}" "${args}" && continue

        if printf '%s\n' "${comm} ${args}" | grep -Eiq '(lmstudio|ollama|vllm|llama|llm|text-generation|kobold|tabbyapi|python[^[:space:]]*[[:space:]].*(transformers|llama|vllm))'; then
            printf '%s\t%s\t%s\n' "${pid}" "${comm}" "${args}"
        fi
    done
}

terminate_pid() {
    local pid="${1}"
    local label="${2}"

    if ! kill -0 "${pid}" 2>/dev/null; then
        return 0
    fi

    kill -TERM "${pid}" 2>/dev/null || true

    local _i
    for _i in 1 2 3 4 5; do
        if ! kill -0 "${pid}" 2>/dev/null; then
            TERMINATED_PIDS+=("${pid}")
            TERMINATED_LABELS+=("${label}")
            return 0
        fi
        sleep 1
    done

    kill -KILL "${pid}" 2>/dev/null || true
    sleep 1

    if ! kill -0 "${pid}" 2>/dev/null; then
        TERMINATED_PIDS+=("${pid}")
        TERMINATED_LABELS+=("${label}")
    fi
}

cleanup_extra_llm_processes() {
    local entry
    while IFS=$'\t' read -r pid comm args; do
        [[ -n "${pid:-}" ]] || continue
        terminate_pid "${pid}" "${comm}: ${args}"
    done < <(collect_candidate_processes)
}

print_report() {
    local before_used="${1}"
    local after_used="${2}"
    local total="${3}"
    local source="${4}"
    local freed=0

    if (( before_used > after_used )); then
        freed=$((before_used - after_used))
    fi

    echo
    echo "VRAM cleanup report"
    echo "==================="
    print_line "Metric source:" "${source}"
    print_line "Total VRAM:" "$(bytes_to_gib "${total}")"
    print_line "Used before:" "$(bytes_to_gib "${before_used}") ($(percent_str "${before_used}" "${total}"))"
    print_line "Freed:" "$(bytes_to_gib "${freed}")"
    print_line "Used after:" "$(bytes_to_gib "${after_used}") ($(percent_str "${after_used}" "${total}"))"
    echo
    echo "Actions"
    echo "======="
    print_line "LM models:" "${LM_MODELS_UNLOADED}"
    print_line "LM server:" "$([[ "${LM_SERVER_STOPPED}" -eq 1 ]] && echo "stopped" || echo "unchanged")"
    print_line "Extra PIDs:" "${#TERMINATED_PIDS[@]}"
    if ((${#TERMINATED_LABELS[@]} > 0)); then
        printf '%s\n' "Processes:"
        printf '  - %s\n' "${TERMINATED_LABELS[@]}"
    fi
}

main() {
    local total_bytes before_used source
    local after_total after_used after_source

    read -r total_bytes before_used source < <(read_vram_metrics)

    echo "Scanning VRAM and unloading non-system LLM workloads..."
    print_line "Metric source:" "${source}"
    print_line "Total VRAM:" "$(bytes_to_gib "${total_bytes}")"
    print_line "Used now:" "$(bytes_to_gib "${before_used}") ($(percent_str "${before_used}" "${total_bytes}"))"

    stop_lmstudio
    cleanup_extra_llm_processes

    sleep 2

    read -r after_total after_used after_source < <(read_vram_metrics)
    print_report "${before_used}" "${after_used}" "${after_total}" "${after_source}"
}

main "$@"
