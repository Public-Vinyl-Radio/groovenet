#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../worktree/lib.sh"
case "${1:-}" in login|status) ;; *) usage_error 'Expected login or status' ;; esac
project="$(detect_running_compose_project)"
[[ -n "$project" ]] || usage_error 'Start the worktree downloads and lossless profiles first'
worker="$(docker ps \
  --filter "label=com.docker.compose.project=$project" \
  --filter "label=com.docker.compose.service=download-worker" \
  --format '{{.ID}}' | head -n 1)"
[[ -n "$worker" ]] || usage_error 'Start the download-worker with the downloads profile first'
# Exec into the existing container: its environment is already configured.
# Explicitly allocate a terminal for hidden input. Compose/op run may pipe stdio
# for output masking, which prevents getpass from controlling terminal echo.
if [[ "$1" == login ]]; then
  docker exec -it "$worker" python -m worker.wrapper_cli login
else
  docker exec "$worker" python -m worker.wrapper_cli status
fi
