#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

PURGE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      continue
      ;;
    --purge)
      PURGE=true
      shift
      ;;
    -h|--help)
      cat <<EOF
Usage: $(basename "$0") [--purge]

Stops the current worktree stack, removes the generated Caddy fragment,
and optionally deletes the compose volumes for this worktree.
EOF
      exit 0
      ;;
    *)
      usage_error "Unknown argument: $1"
      ;;
  esac
done

require_command docker
ensure_worktree_env

down_args=(down --remove-orphans)
if [[ "$PURGE" == true ]]; then
  down_args+=(-v)
fi
compose_exec --profile '*' "${down_args[@]}"

rm -f "$(caddy_fragment_file)"
if command -v caddy >/dev/null 2>&1; then
  reload_caddy
fi

echo "Worktree torn down for $WORKTREE_HOST"
if [[ "$PURGE" == true ]]; then
  echo "Compose volumes were removed."
fi
