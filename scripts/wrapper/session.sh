#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../worktree/lib.sh"
case "${1:-}" in login|status) ;; *) usage_error 'Expected login or status' ;; esac
project="$(detect_running_compose_project)"
[[ -n "$project" ]] || usage_error 'Start the worktree downloads and lossless profiles first'
# Run Python in the worker so no sidecar port or host credentials are needed.
# The login uses a terminal for hidden input; status also works unattended.
if [[ "$1" == login ]]; then
  compose_exec_detect "$project" exec download-worker python -m worker.wrapper_cli login
else
  compose_exec_detect "$project" exec -T download-worker python -m worker.wrapper_cli status
fi
