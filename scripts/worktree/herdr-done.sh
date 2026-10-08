#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

FORCE=false
DELETE_BRANCH=false
DRY_RUN=false

print_usage() {
  cat <<EOF
Usage: $(basename "$0") [--force] [--delete-branch] [--dry-run]

Run from a pane inside a worktree's herdr workspace (just herdr-task) when
the task is finished. Tears down the worktree's compose stack (just
worktree-purge, skipped if no stack exists for it), then removes the herdr
workspace, which deletes the worktree checkout itself.

Refuses to run outside a worktree (the main checkout has no stack or
workspace of its own to remove) and outside herdr.

  --force          proceed even with uncommitted changes or unpushed commits
  --delete-branch  delete the local branch afterward, but only once its PR
                   has actually merged (checked via 'gh pr view --json
                   state', since squash merges leave 'git branch --merged'
                   unreliable)
  --dry-run        print what would happen without removing anything

Removing the herdr workspace closes the pane this command runs in, so that
step always runs detached as the last action.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      continue
      ;;
    --force)
      FORCE=true
      shift
      ;;
    --delete-branch)
      DELETE_BRANCH=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      usage_error "Unknown argument: $1 (see --help)"
      ;;
  esac
done

require_command git docker herdr jq

if [[ "${HERDR_ENV:-}" != 1 ]]; then
  usage_error "Not inside herdr. Run this from a pane in the worktree's herdr workspace."
fi

main_worktree="$(_main_worktree)"
if [[ "$REPO_ROOT" == "$main_worktree" ]]; then
  usage_error "Refusing to run in the main checkout ($main_worktree). herdr-done finishes a worktree task, not the main checkout."
fi

if [[ "$FORCE" != true ]]; then
  dirty="$(git -C "$REPO_ROOT" status --porcelain)"
  if [[ -n "$dirty" ]]; then
    echo "Uncommitted changes in $REPO_ROOT:" >&2
    echo "$dirty" >&2
    usage_error "Commit, stash, or pass --force."
  fi

  unpushed="$(git -C "$REPO_ROOT" rev-list HEAD --not --remotes --count)"
  if [[ "$unpushed" != "0" ]]; then
    usage_error "$unpushed unpushed commit(s) on $CURRENT_BRANCH. Push them or pass --force."
  fi
fi

project="$(compose_project_name "$REPO_ROOT" "$CURRENT_BRANCH")"
stack_exists=false
if docker compose ls --all --format json | jq -e --arg p "$project" 'any(.[]; .Name == $p)' >/dev/null; then
  stack_exists=true
fi

if [[ "$stack_exists" == true ]]; then
  if [[ "$DRY_RUN" == true ]]; then
    echo "Would run: just worktree-purge (project $project)"
  else
    echo "Tearing down stack $project ..."
    (cd "$REPO_ROOT" && just worktree-purge)
  fi
else
  echo "No compose stack found for $project; skipping worktree-purge."
fi

branch_to_delete=""
if [[ "$DELETE_BRANCH" == true ]]; then
  pr_state="$(gh pr view "$CURRENT_BRANCH" --json state -q .state 2>/dev/null || true)"
  if [[ "$pr_state" == "MERGED" ]]; then
    branch_to_delete="$CURRENT_BRANCH"
  else
    echo "PR for $CURRENT_BRANCH is not merged (state: ${pr_state:-none}); not deleting the branch."
  fi
fi

workspace_id="${HERDR_WORKSPACE_ID:-}"
if [[ -z "$workspace_id" ]]; then
  workspace_id="$(herdr pane current --current | jq -r '.result.pane.workspace_id // empty')"
fi
[[ -n "$workspace_id" ]] || usage_error "Could not determine the current herdr workspace id."

if [[ "$DRY_RUN" == true ]]; then
  echo "Would run: herdr worktree remove --workspace $workspace_id"
  if [[ -n "$branch_to_delete" ]]; then
    echo "Would run: git -C $main_worktree branch -D $branch_to_delete"
  fi
  exit 0
fi

echo "Removing herdr workspace $workspace_id ..."
echo "This closes the current pane; finishing detached."

remove_force_flag=()
[[ "$FORCE" == true ]] && remove_force_flag=(--force)

log_file="$(mktemp "${TMPDIR:-/tmp}/herdr-done.XXXXXX")"
if [[ -n "$branch_to_delete" ]]; then
  nohup bash -c '
    set -euo pipefail
    herdr worktree remove --workspace "$1" "${@:4}"
    git -C "$2" branch -D "$3"
  ' _ "$workspace_id" "$main_worktree" "$branch_to_delete" "${remove_force_flag[@]}" >"$log_file" 2>&1 &
else
  nohup herdr worktree remove --workspace "$workspace_id" "${remove_force_flag[@]}" >"$log_file" 2>&1 &
fi
disown
