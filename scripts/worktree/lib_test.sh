#!/usr/bin/env bash
# Self-test for the slug/project-name derivation shared by worktree-up and
# worktree-gc. No bats or other shell-test framework is set up in this repo,
# so this is the "--self-test mode" fallback: plain assertions, run directly
# or via 'just worktree-gc -- --self-test' / 'scripts/worktree/gc.sh --self-test'.
# Touches no Docker, Caddy, or git state.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

PROJECT_NAME_PATTERN='^dj-.+-[0-9a-f]{6}$'

failures=0

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "ok - $label"
  else
    echo "FAIL - $label: expected [$expected], got [$actual]"
    failures=$((failures + 1))
  fi
}

assert_match() {
  local label="$1" pattern="$2" actual="$3"
  if [[ "$actual" =~ $pattern ]]; then
    echo "ok - $label"
  else
    echo "FAIL - $label: [$actual] does not match /$pattern/"
    failures=$((failures + 1))
  fi
}

assert_true() {
  local label="$1" condition="$2"
  if [[ "$condition" == true ]]; then
    echo "ok - $label"
  else
    echo "FAIL - $label"
    failures=$((failures + 1))
  fi
}

# --- sanitize_slug ---

assert_eq "sanitize_slug lowercases and hyphenates" \
  "feat-123-fix" "$(sanitize_slug "Feat/123 Fix!")"

assert_eq "sanitize_slug collapses repeated separators" \
  "a-b-c" "$(sanitize_slug "a///b   c")"

# --- worktree_branch_name ---

assert_eq "worktree_branch_name keeps a normal branch" \
  "feat/123-fix" "$(worktree_branch_name /tmp/some-worktree "feat/123-fix")"

assert_eq "worktree_branch_name falls back to basename on detached HEAD" \
  "some-worktree" "$(worktree_branch_name /tmp/some-worktree "")"

assert_eq "worktree_branch_name falls back to basename on literal HEAD" \
  "some-worktree" "$(worktree_branch_name /tmp/some-worktree "HEAD")"

# --- worktree_slug ---

long_branch="feat/this-is-a-really-long-branch-name-that-exceeds-the-limit"
slug="$(worktree_slug /tmp/some-path "$long_branch")"
branch_part="${slug%-*}"
assert_true "worktree_slug truncates the branch part to 32 chars" \
  "$([[ ${#branch_part} -le 32 ]] && echo true || echo false)"
assert_match "worktree_slug appends a 6-char lowercase-hex path hash" \
  '^.+-[0-9a-f]{6}$' "$slug"

assert_eq "worktree_slug is deterministic for the same (path, branch)" \
  "$(worktree_slug /tmp/some-path main)" "$(worktree_slug /tmp/some-path main)"

slug_a="$(worktree_slug /tmp/path-a main)"
slug_b="$(worktree_slug /tmp/path-b main)"
assert_true "worktree_slug differs for different paths" \
  "$([[ "$slug_a" != "$slug_b" ]] && echo true || echo false)"

# --- compose_project_name ---

project="$(compose_project_name /tmp/some-path main)"
assert_eq "compose_project_name prefixes dj- onto the slug" \
  "dj-$(worktree_slug /tmp/some-path main)" "$project"
assert_match "compose_project_name matches gc.sh's orphan-candidate pattern" \
  "$PROJECT_NAME_PATTERN" "$project"

# A project name this scheme could never produce (the main checkout's
# default, or a pre-herdr supacode project) must NOT match gc.sh's pattern,
# or gc.sh would risk tearing down a stack it doesn't own.
assert_true "gc.sh's pattern rejects the main checkout's default project name" \
  "$([[ ! "dj-playlist" =~ $PROJECT_NAME_PATTERN ]] && echo true || echo false)"
assert_true "gc.sh's pattern rejects an un-prefixed legacy supacode project" \
  "$([[ ! "feat-375-genre-filter" =~ $PROJECT_NAME_PATTERN ]] && echo true || echo false)"

# --- worktree_list_entries, against this real repo (read-only) ---

this_branch="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
found="$(worktree_list_entries | awk -F'\t' -v p="$REPO_ROOT" '$1 == p { print $2 }')"
assert_eq "worktree_list_entries reports this worktree's own branch" \
  "$this_branch" "$found"

echo
if ((failures == 0)); then
  echo "All self-tests passed."
  exit 0
fi
echo "$failures self-test(s) failed."
exit 1
