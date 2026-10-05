#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

BRANCH=""
BASE="main"
WITH_STACK=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      continue
      ;;
    --base)
      BASE="${2:-}"
      [[ -n "$BASE" ]] || usage_error "--base requires a ref"
      shift 2
      ;;
    --no-stack)
      WITH_STACK=false
      shift
      ;;
    -h|--help)
      cat <<EOF
Usage: $(basename "$0") <branch> [--base REF] [--no-stack]

Run from a pane inside the groovenet herdr session (just herdr). Creates a
worktree for <branch> off REF (default: main), opens it as a new herdr
workspace, and runs 'just worktree-up' in that workspace's first pane so the
worktree gets its own compose stack, port and Caddy vhost.

  --no-stack   skip 'just worktree-up' (docs or single-service work)
EOF
      exit 0
      ;;
    -*)
      usage_error "Unknown argument: $1"
      ;;
    *)
      [[ -z "$BRANCH" ]] || usage_error "Only one branch may be given"
      BRANCH="$1"
      shift
      ;;
  esac
done

[[ -n "$BRANCH" ]] || usage_error "A branch name is required (see --help)"
require_command herdr jq

# herdr commands talk to the session of the pane they run in; outside herdr
# there is no session to target.
if [[ "${HERDR_ENV:-}" != 1 ]]; then
  usage_error "Not inside herdr. Run 'just herdr' first, then run this from a pane in that session."
fi

created="$(herdr worktree create \
  --cwd "$REPO_ROOT" \
  --branch "$BRANCH" \
  --base "$BASE" \
  --label "$BRANCH" \
  --focus)"

worktree_path="$(jq -r '.result.worktree.path' <<<"$created")"
pane_id="$(jq -r '.result.root_pane.pane_id' <<<"$created")"
echo "Worktree $BRANCH → $worktree_path"

if [[ "$WITH_STACK" == true ]]; then
  herdr pane run "$pane_id" "just worktree-up" >/dev/null
  echo "Started 'just worktree-up' in pane $pane_id."
fi
