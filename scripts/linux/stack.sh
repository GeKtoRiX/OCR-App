#!/usr/bin/env bash
# OCR App — interactive stack launcher

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/ocr-common.sh"

menu_show_header() {
    header "OCR App — Stack Menu"
}

menu_show_current_stack() {
    read_state

    echo -e "${BOLD}Current stack:${RESET}"
    if [[ -n "${ACTIVE_MODE}" ]]; then
        ok "${ACTIVE_MODE_LABEL}"
        echo "  $(compute_mode_lamp "${ACTIVE_MODE}")"
        if mode_includes_backend && check_backend; then
            ok "Project URL: http://localhost:${APP_PORT}"
        fi
    else
        warn "STOPPED"
        dim "No tracked stack is currently active."
    fi
    echo
}

menu_show_actions() {
    echo -e "${BOLD}Actions:${RESET}"
    echo "  1. Start OCR stack"
    echo "  2. Start TTS stack"
    echo "  3. Start OCR + TTS stack"
    echo "  4. Show detailed status"
    echo "  5. Stop current stack"
    echo "  6. Refresh menu"
    echo "  q. Quit menu"
    echo
}

menu_start_stack() {
    local mode="${1}"
    local label="${2}"

    echo
    log "Starting ${label} stack..."
    if start_mode_stack "${mode}"; then
        ok "${label} stack is running."
        echo "  $(compute_mode_lamp "${mode}")"
    else
        fail "${label} stack failed to start."
    fi
    echo
}

menu_stop_stack() {
    echo
    log "Stopping current stack..."
    cmd_stop
    ok "Stack stopped."
    echo
}

menu_interrupt() {
    trap - INT TERM
    echo
    warn "Ctrl+C received."
    read_state
    if [[ -n "${ACTIVE_MODE}" ]]; then
        log "Stopping current stack before exit..."
        cmd_stop
        ok "Stack stopped."
    else
        dim "No tracked stack is currently active."
    fi
    echo
    exit 130
}

menu_loop() {
    ensure_dirs
    trap menu_interrupt INT TERM

    while true; do
        menu_show_header
        menu_show_current_stack
        menu_show_actions

        read -rp "Select action [1-6, q]: " choice
        case "${choice}" in
            1) menu_start_stack "ocr" "OCR" ;;
            2) menu_start_stack "tts" "TTS" ;;
            3) menu_start_stack "all" "OCR + TTS" ;;
            4) echo; cmd_status; echo ;;
            5) menu_stop_stack ;;
            6)
                echo
                log "Refreshing menu..."
                echo
                ;;
            q|Q)
                echo
                log "Exiting menu."
                echo
                break
                ;;
            *)
                echo
                warn "Invalid selection. Choose 1, 2, 3, 4, 5, 6, or q."
                echo
                ;;
        esac
    done
}

menu_loop "$@"
