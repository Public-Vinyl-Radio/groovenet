#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

BRANCH=""
BASE="main"
WITH_BOOTSTRAP=true
WITH_STACK=true
AGENT="claude"
PROMPT=""
PROMPT_FILE=""
ISSUE=""

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
    --agent)
      AGENT="${2:-}"
      [[ -n "$AGENT" ]] || usage_error "--agent requires a value"
      shift 2
      ;;
    --prompt)
      PROMPT="${2:-}"
      [[ -n "$PROMPT" ]] || usage_error "--prompt requires text"
      shift 2
      ;;
    --prompt-file)
      PROMPT_FILE="${2:-}"
      [[ -n "$PROMPT_FILE" ]] || usage_error "--prompt-file requires a path"
      shift 2
      ;;
    --issue)
      ISSUE="${2:-}"
      [[ -n "$ISSUE" ]] || usage_error "--issue requires an issue number"
      shift 2
      ;;
    -h|--help)
      cat <<EOF
Usage: $(basename "$0") <branch> [--base REF] [--no-bootstrap] [--no-stack]
       [--agent claude|codex] [--prompt TEXT | --prompt-file PATH | --issue N]

Run from a pane inside the groovenet herdr session (just herdr). Creates a
worktree for <branch> off REF (default: main), opens it as a new herdr
workspace, and runs setup in that workspace's first pane: 'just bootstrap'
for dependencies, then 'just worktree-up' so the worktree gets its own compose
stack, port and Caddy vhost.

When a prompt is given (via --prompt, --prompt-file, or --issue), it is
written to a temp file and the chosen agent is started with it as the last
setup step, after 'just bootstrap' and 'just worktree-up' succeed — and
immediately when both of those are skipped. From that point the agent runs
unattended in the new pane and may commit, push, or open a PR on its own, so
review its work before trusting it.

  --no-bootstrap        skip 'just bootstrap'
  --no-stack            skip 'just worktree-up' (docs or single-service work)
  --agent KIND          agent to start: 'claude' (default) or 'codex'
  --prompt TEXT         start the agent with this prompt
  --prompt-file PATH    start the agent with the prompt read from PATH
  --issue N             start the agent with a default prompt to fix issue #N,
                        follow CLAUDE.md, run coverage, and open a PR that
                        closes #N

--prompt, --prompt-file, and --issue are mutually exclusive.
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

case "$AGENT" in
  claude|codex) ;;
  *) usage_error "--agent must be 'claude' or 'codex'" ;;
esac

prompt_sources=0
[[ -n "$PROMPT" ]] && prompt_sources=$((prompt_sources + 1))
[[ -n "$PROMPT_FILE" ]] && prompt_sources=$((prompt_sources + 1))
[[ -n "$ISSUE" ]] && prompt_sources=$((prompt_sources + 1))
(( prompt_sources <= 1 )) || usage_error "--prompt, --prompt-file, and --issue are mutually exclusive"

if [[ -n "$ISSUE" ]]; then
  [[ "$ISSUE" =~ ^[0-9]+$ ]] || usage_error "--issue requires a numeric issue number"
fi

if [[ -n "$PROMPT_FILE" ]]; then
  [[ -f "$PROMPT_FILE" ]] || usage_error "--prompt-file not found: $PROMPT_FILE"
fi

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

PROMPT_TEXT=""
if [[ -n "$PROMPT" ]]; then
  PROMPT_TEXT="$PROMPT"
elif [[ -n "$PROMPT_FILE" ]]; then
  PROMPT_TEXT="$(cat "$PROMPT_FILE")"
elif [[ -n "$ISSUE" ]]; then
  PROMPT_TEXT="$(cat <<EOF
Fix issue #$ISSUE in this repository (run \`gh issue view $ISSUE\` for
details). Follow this repo's CLAUDE.md conventions, including running
coverage for every component you touch. When the fix is ready, open a PR
that closes #$ISSUE.
EOF
)"
fi

setup=()
[[ "$WITH_BOOTSTRAP" == true ]] && setup+=("just bootstrap")
[[ "$WITH_STACK" == true ]] && setup+=("just worktree-up")

if [[ -n "$PROMPT_TEXT" ]]; then
  prompt_tmp="$(mktemp "${TMPDIR:-/tmp}/herdr-task-prompt.XXXXXX")"
  printf '%s\n' "$PROMPT_TEXT" >"$prompt_tmp"
  setup+=("$AGENT \"\$(cat '$prompt_tmp')\"")
fi

if (( ${#setup[@]} > 0 )); then
  setup_cmd="$(printf ' && %s' "${setup[@]}")"
  setup_cmd="${setup_cmd:4}"
  herdr pane run "$pane_id" "$setup_cmd" >/dev/null
  echo "Started '$setup_cmd' in pane $pane_id."
  if [[ -n "$PROMPT_TEXT" ]]; then
    echo "$AGENT is running unattended in pane $pane_id and may open a PR on its own."
  fi
fi
