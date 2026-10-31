#!/usr/bin/env bash
# Start a task in a new herdr worktree workspace. herdr-agent (from the
# dotfiles) does the work: it creates the workspace, runs this repo's
# `just worktree-setup` in its first pane, and starts the coding agent once
# setup succeeds. Choosing the agent and model is herdr-agent's business; this
# wrapper only adds what is specific to this repo.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

BRANCH=""
BASE=""
WITH_BOOTSTRAP=true
WITH_STACK=true
ISSUE=""
PASSTHROUGH=()

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
    --no-bootstrap)
      WITH_BOOTSTRAP=false
      shift
      ;;
    --no-stack)
      WITH_STACK=false
      shift
      ;;
    --issue)
      ISSUE="${2:-}"
      [[ "$ISSUE" =~ ^[0-9]+$ ]] || usage_error "--issue requires a numeric issue number"
      shift 2
      ;;
    -h|--help)
      cat <<EOF
Usage: $(basename "$0") <branch> [--base REF] [--no-bootstrap] [--no-stack]
       [--issue N] [herdr-agent options]

Run from a pane inside the groovenet herdr session (just herdr). Hands off to
herdr-agent, which creates a worktree for <branch> off REF (default:
origin/main), opens it as a new herdr workspace, runs 'just worktree-setup'
there (dependencies, then the worktree's own compose stack, port and Caddy
vhost) and then starts the coding agent. From that point the agent runs
unattended and may commit, push, or open a PR on its own, so review its work
before trusting it.

  --no-bootstrap        skip 'just bootstrap'
  --no-stack            skip 'just worktree-up' (docs or single-service work)
  --issue N             start the agent with a default prompt to fix issue #N,
                        follow CLAUDE.md, run coverage, and open a PR that
                        closes #N

Everything else goes to herdr-agent: --agent, --model, --prompt,
--prompt-file, --no-agent, --dry-run and the rest (see herdr-agent --help).
EOF
      exit 0
      ;;
    -*)
      # A herdr-agent option; those that take a value carry it along.
      case "$1" in
        --agent|--model|--prompt|--prompt-file|--preset|--ticket|--pr|--setup|--repo)
          [[ $# -ge 2 ]] || usage_error "$1 requires a value"
          PASSTHROUGH+=("$1" "$2")
          shift 2
          ;;
        *)
          PASSTHROUGH+=("$1")
          shift
          ;;
      esac
      ;;
    *)
      [[ -z "$BRANCH" ]] || usage_error "Only one branch may be given"
      BRANCH="$1"
      shift
      ;;
  esac
done

[[ -n "$BRANCH" ]] || usage_error "A branch name is required (see --help)"

AGENT_BIN="${HERDR_AGENT_BIN:-herdr-agent}"
command -v "$AGENT_BIN" >/dev/null 2>&1 \
  || usage_error "herdr-agent is not installed; it comes from the dotfiles (herdr/.local/bin/herdr-agent)."

args=("$BRANCH" --base "${BASE:-origin/main}")

if [[ "$WITH_BOOTSTRAP" == false && "$WITH_STACK" == false ]]; then
  args+=(--no-setup)
elif [[ "$WITH_BOOTSTRAP" == false ]]; then
  args+=(--setup "just worktree-up")
elif [[ "$WITH_STACK" == false ]]; then
  args+=(--setup "just worktree-setup --no-stack")
fi

if [[ -n "$ISSUE" ]]; then
  args+=(--prompt "$(cat <<EOF
Fix issue #$ISSUE in this repository (run \`gh issue view $ISSUE\` for
details). Follow this repo's CLAUDE.md conventions, including running
coverage for every component you touch. When the fix is ready, open a PR
that closes #$ISSUE.
EOF
)")
fi

exec "$AGENT_BIN" "${args[@]}" ${PASSTHROUGH[@]+"${PASSTHROUGH[@]}"}
