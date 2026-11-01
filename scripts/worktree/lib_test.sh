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

# Failures are appended to a file so assertions inside subshells still count.
FAIL_FILE="$(mktemp)"
record_failure() { echo x >>"$FAIL_FILE"; }

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "ok - $label"
  else
    echo "FAIL - $label: expected [$expected], got [$actual]"
    record_failure
  fi
}

assert_match() {
  local label="$1" pattern="$2" actual="$3"
  if [[ "$actual" =~ $pattern ]]; then
    echo "ok - $label"
  else
    echo "FAIL - $label: [$actual] does not match /$pattern/"
    record_failure
  fi
}

assert_true() {
  local label="$1" condition="$2"
  if [[ "$condition" == true ]]; then
    echo "ok - $label"
  else
    echo "FAIL - $label"
    record_failure
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

# --- port allocation, against temp dirs only ---

TEST_TMP="$(mktemp -d)"
trap 'rm -rf "$TEST_TMP" "$FAIL_FILE"' EXIT

# Ports high in the range so a real listener on a dev box can't collide.
export APP_PORT_START=39100 APP_PORT_END=39199
export WORKTREE_LOCK_DIR="$TEST_TMP/port.lock"

# new_state_dir <name> [port]: a fake worktree's .worktree dir, optionally
# holding an env file that claims <port>.
new_state_dir() {
  mkdir -p "$TEST_TMP/$1"
  if [[ -n "${2:-}" ]]; then
    printf 'APP_PORT=%s\n' "$2" >"$TEST_TMP/$1/other.env"
  fi
  printf '%s' "$TEST_TMP/$1"
}

other_a="$(new_state_dir other-a 39100)"
other_b="$(new_state_dir other-b 39101)"
mine="$(new_state_dir mine)"
scan="$other_a"$'\n'"$other_b"$'\n'"$mine"

(
  export WORKTREE_STATE_SCAN_DIRS="$scan" WORKTREE_STATE_DIR="$mine"
  assert_eq "claimed_ports lists other worktrees' APP_PORT claims" \
    "39100 39101" "$(claimed_ports | sort | tr '\n' ' ' | sed 's/ $//')"
  assert_eq "find_free_port skips ports claimed in another env file" \
    "39102" "$(find_free_port)"

  # The worktree's own claim is not counted against itself.
  printf 'APP_PORT=39102\n' >"$(worktree_env_file)"
  assert_eq "claimed_ports ignores this worktree's own env file" \
    "39100 39101" "$(claimed_ports | sort | tr '\n' ' ' | sed 's/ $//')"
  assert_eq "create_worktree_env keeps an existing claim" \
    "39102" "$(
      create_worktree_env
      sed -n 's/^APP_PORT=//p' "$(worktree_env_file)"
    )"
  rm -f "$(worktree_env_file)"

  create_worktree_env
  assert_eq "create_worktree_env writes the first unclaimed port" \
    "39102" "$(sed -n 's/^APP_PORT=//p' "$(worktree_env_file)")"
  assert_true "create_worktree_env releases the lock" \
    "$([[ ! -e "$WORKTREE_LOCK_DIR" ]] && echo true || echo false)"
)

# Default scan dirs come from git, one per known worktree.
assert_true "worktree_state_dirs defaults to git's worktrees" \
  "$([[ $'\n'"$(worktree_state_dirs)"$'\n' == *$'\n'"$REPO_ROOT/.worktree"$'\n'* ]] && echo true || echo false)"

# Range exhausted: every port claimed.
(
  export APP_PORT_START=39200 APP_PORT_END=39201
  exhausted="$(new_state_dir exhausted)"
  printf 'APP_PORT=39200\n' >"$exhausted/a.env"
  printf 'APP_PORT=39201\n' >"$exhausted/b.env"
  export WORKTREE_STATE_SCAN_DIRS="$exhausted" WORKTREE_STATE_DIR="$mine"
  if (find_free_port) >/dev/null 2>&1; then
    echo "FAIL - find_free_port errors when the range is exhausted"
    exit 1
  fi
  echo "ok - find_free_port errors when the range is exhausted"
) || record_failure

# --- concurrent allocation gets distinct ports ---

conc_dirs=()
for n in 1 2 3; do
  conc_dirs+=("$(new_state_dir "conc-$n")")
done
conc_scan="$(printf '%s\n' "${conc_dirs[@]}")"
rm -rf "$WORKTREE_LOCK_DIR"
for n in 1 2 3; do
  (
    export WORKTREE_STATE_SCAN_DIRS="$conc_scan"
    export WORKTREE_STATE_DIR="$TEST_TMP/conc-$n"
    REPO_ROOT="/tmp/fake-worktree-$n"
    CURRENT_BRANCH="feat/conc-$n"
    create_worktree_env
  ) &
done
wait
conc_ports="$(cat "$TEST_TMP"/conc-*/*.env | sed -n 's/^APP_PORT=//p' | sort | tr '\n' ' ')"
echo "concurrent allocation assigned: $conc_ports"
assert_eq "three concurrent allocations get three distinct ports" \
  "3" "$(printf '%s\n' $conc_ports | sort -u | wc -l | tr -d ' ')"

# --- lock handling ---

lock_test_dir="$TEST_TMP/lock-cases"
mkdir -p "$lock_test_dir"

(
  export WORKTREE_LOCK_DIR="$lock_test_dir/stale-pid.lock"
  mkdir "$WORKTREE_LOCK_DIR"
  printf '999999' >"$WORKTREE_LOCK_DIR/pid"
  acquire_worktree_lock
  assert_eq "a lock held by a dead pid is reclaimed" \
    "$BASHPID" "$(cat "$WORKTREE_LOCK_DIR/pid")"
)

(
  export WORKTREE_LOCK_DIR="$lock_test_dir/stale-age.lock"
  export WORKTREE_LOCK_STALE_SECONDS=-1
  mkdir "$WORKTREE_LOCK_DIR"
  acquire_worktree_lock
  assert_true "a pid-less lock older than the limit is reclaimed" \
    "$([[ -f "$WORKTREE_LOCK_DIR/pid" ]] && echo true || echo false)"
)

(
  export WORKTREE_LOCK_DIR="$lock_test_dir/held.lock"
  export WORKTREE_LOCK_TIMEOUT_SECONDS=1
  mkdir "$WORKTREE_LOCK_DIR"
  printf '%s' "$$" >"$WORKTREE_LOCK_DIR/pid"
  if out="$( (acquire_worktree_lock) 2>&1)"; then
    echo "FAIL - a live lock times out"
    exit 1
  fi
  [[ "$out" == *"Timed out"* ]] || { echo "FAIL - timeout message: $out"; exit 1; }
  echo "ok - a live lock times out"
) || record_failure

# --- 1Password fallback, with fake op and docker on PATH ---

fake_bin="$TEST_TMP/bin"
mkdir -p "$fake_bin"
cat >"$fake_bin/docker" <<'FAKE'
#!/usr/bin/env bash
echo "docker $*" >>"$FAKE_LOG"
exit "${FAKE_DOCKER_STATUS:-0}"
FAKE
cat >"$fake_bin/op" <<'FAKE'
#!/usr/bin/env bash
echo "op $1" >>"$FAKE_LOG"
case "$1" in
  whoami) exit "${FAKE_OP_WHOAMI_STATUS:-0}" ;;
  run)
    while [[ "$1" != "--" ]]; do shift; done
    shift
    exec "$@"
    ;;
esac
FAKE
chmod +x "$fake_bin/docker" "$fake_bin/op"
touch "$TEST_TMP/.env.tpl"

# run_compose_case <whoami-status> <docker-status>: prints "<rc>|<log lines>"
run_compose_case() {
  local log="$TEST_TMP/compose.log" rc=0
  : >"$log"
  (
    export PATH="$fake_bin:$PATH" FAKE_LOG="$log" COMPOSE_DIR="$TEST_TMP"
    export FAKE_OP_WHOAMI_STATUS="$1" FAKE_DOCKER_STATUS="$2"
    compose_exec_detect proj up -d
  ) >/dev/null 2>&1 || rc=$?
  printf '%s|%s' "$rc" "$(tr '\n' ';' <"$log")"
}

assert_match "compose runs under op when op is signed in" \
  '^0\|op whoami;op run;docker compose .* up -d;$' "$(run_compose_case 0 0)"

result="$(run_compose_case 1 0)"
assert_match "compose falls back without op when injection is unavailable" \
  '^0\|op whoami;docker compose ' "$result"
assert_true "fallback does not invoke op run" \
  "$([[ "$result" != *"op run"* ]] && echo true || echo false)"

result="$(run_compose_case 0 3)"
assert_match "a compose failure under op returns compose's status" '^3\|' "$result"
assert_eq "a compose failure under op is not retried without op" \
  "1" "$(grep -o 'docker compose' <<<"$result" | wc -l | tr -d ' ')"

# No op on PATH at all, or no template: plain compose.
(
  export PATH="$TEST_TMP/bin-docker-only:/usr/bin:/bin" FAKE_LOG="$TEST_TMP/noop.log" COMPOSE_DIR="$TEST_TMP"
  mkdir -p "$TEST_TMP/bin-docker-only"
  cp "$fake_bin/docker" "$TEST_TMP/bin-docker-only/docker"
  : >"$FAKE_LOG"
  compose_exec_detect proj up -d >/dev/null 2>&1
  assert_match "compose runs plainly when op is not installed" \
    '^docker compose ' "$(cat "$FAKE_LOG")"
)
(
  export PATH="$fake_bin:$PATH" FAKE_LOG="$TEST_TMP/notpl.log" COMPOSE_DIR="$TEST_TMP/no-template"
  mkdir -p "$COMPOSE_DIR"
  : >"$FAKE_LOG"
  compose_exec_detect proj up -d >/dev/null 2>&1
  assert_match "compose runs plainly when there is no .env.tpl" \
    '^docker compose ' "$(cat "$FAKE_LOG")"
)

failures="$(wc -l <"$FAIL_FILE" | tr -d ' ')"
echo
if ((failures == 0)); then
  echo "All self-tests passed."
  exit 0
fi
echo "$failures self-test(s) failed."
exit 1
