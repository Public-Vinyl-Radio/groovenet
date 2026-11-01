#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_DIR="${COMPOSE_DIR:-$REPO_ROOT}"
APP_DIR="${APP_DIR:-$REPO_ROOT/my-collection-search}"
WORKTREE_STATE_DIR="${WORKTREE_STATE_DIR:-$REPO_ROOT/.worktree}"
_main_worktree() { git -C "$REPO_ROOT" worktree list --porcelain | awk '/^worktree /{print $2; exit}'; }
REPO_NAME="${REPO_NAME:-$(basename "$(_main_worktree)")}"
# The branch for REPO_ROOT, captured once so every slug/project lookup below
# agrees even if something checks out a different ref mid-script.
CURRENT_BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
SEED_ROOT="${SEED_ROOT:-$HOME/.herdr/worktree-seeds/$REPO_NAME}"
SEED_LATEST_DIR="${SEED_LATEST_DIR:-$SEED_ROOT/latest}"
CADDY_WORKTREE_DIR="${CADDY_WORKTREE_DIR:-$HOME/.config/caddy/worktrees}"
CADDY_HOST_SUFFIX="${CADDY_HOST_SUFFIX:-groovenet.localhost}"
CADDY_ADMIN_ADDRESS="${CADDY_ADMIN_ADDRESS:-127.0.0.1:2019}"
if [[ -z "${CADDY_CONFIG_FILE:-}" ]]; then
  if [[ "$(uname -s)" == "Darwin" && -x /opt/homebrew/bin/brew ]]; then
    CADDY_CONFIG_FILE="/opt/homebrew/etc/Caddyfile"
  else
    CADDY_CONFIG_FILE="$HOME/.config/caddy/Caddyfile"
  fi
fi
APP_PORT_START="${APP_PORT_START:-34000}"
APP_PORT_END="${APP_PORT_END:-34999}"

usage_error() {
  echo "Error: $*" >&2
  exit 1
}

require_command() {
  local cmd
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || usage_error "Required command not found: $cmd"
  done
}

sanitize_slug() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-+/-/g'
}

# worktree_branch_name, worktree_slug and compose_project_name all take an
# explicit (path, branch) pair rather than reading REPO_ROOT/HEAD themselves,
# so setup/teardown (operating on the current worktree) and gc.sh (operating
# on every worktree git knows about) can't drift apart.

worktree_branch_name() {
  local path="$1" branch="$2"
  if [[ -z "$branch" || "$branch" == "HEAD" ]]; then
    branch="$(basename "$path")"
  fi
  printf '%s' "$branch"
}

worktree_slug() {
  local path="$1" branch="$2"
  local branch_slug path_hash
  branch_slug="$(sanitize_slug "$(worktree_branch_name "$path" "$branch")")"
  branch_slug="${branch_slug:0:32}"
  [[ -n "$branch_slug" ]] || branch_slug="worktree"
  path_hash="$(printf '%s' "$path" | shasum | cut -c1-6)"
  printf '%s-%s' "$branch_slug" "$path_hash"
}

compose_project_name() {
  local path="$1" branch="$2"
  local slug project
  slug="$(worktree_slug "$path" "$branch")"
  project="dj-${slug}"
  printf '%s' "${project:0:55}"
}

# worktree_list_entries prints one "<path>\t<branch>" line per worktree known
# to git (main checkout plus every linked worktree), branch empty for a
# detached HEAD. Used by gc.sh to compute every live slug/project in one pass.
worktree_list_entries() {
  local repo_root="${1:-$REPO_ROOT}"
  git -C "$repo_root" worktree list --porcelain | awk '
    /^worktree / { path = substr($0, 10) }
    /^branch /   { branch = substr($0, 8); sub("^refs/heads/", "", branch) }
    /^detached$/ { branch = "" }
    /^$/         { if (path != "") print path "\t" branch; path = ""; branch = "" }
    END          { if (path != "") print path "\t" branch }
  '
}

worktree_host() {
  printf '%s.%s' "$(worktree_slug "$REPO_ROOT" "$CURRENT_BRANCH")" "$CADDY_HOST_SUFFIX"
}

worktree_env_file() {
  printf '%s/%s.env' "$WORKTREE_STATE_DIR" "$(worktree_slug "$REPO_ROOT" "$CURRENT_BRANCH")"
}

caddy_fragment_file() {
  printf '%s/%s.caddy' "$CADDY_WORKTREE_DIR" "$(worktree_slug "$REPO_ROOT" "$CURRENT_BRANCH")"
}

seed_bundle_dir() {
  printf '%s' "$SEED_LATEST_DIR"
}

ensure_dirs() {
  mkdir -p "$WORKTREE_STATE_DIR" "$SEED_ROOT"
}

port_is_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi
  if command -v nc >/dev/null 2>&1; then
    nc -z 127.0.0.1 "$port" >/dev/null 2>&1
    return
  fi
  usage_error "Need either lsof or nc to probe free ports"
}

# worktree_state_dirs prints the .worktree state directory of the main
# checkout and every linked worktree, one per line. Asking git (rather than
# hard-coding ~/.herdr/worktrees) also covers older Supacode worktrees.
# WORKTREE_STATE_SCAN_DIRS (newline-separated) overrides it, for tests.
worktree_state_dirs() {
  if [[ -n "${WORKTREE_STATE_SCAN_DIRS:-}" ]]; then
    printf '%s\n' "$WORKTREE_STATE_SCAN_DIRS"
    return 0
  fi
  local path _branch
  while IFS=$'\t' read -r path _branch; do
    printf '%s/.worktree\n' "$path"
  done < <(worktree_list_entries)
}

# claimed_ports prints every APP_PORT claimed by a worktree state file other
# than this worktree's own, so a stack that is stopped or not up yet still
# keeps its port.
claimed_ports() {
  local own dir file
  own="$(worktree_env_file)"
  while IFS= read -r dir; do
    [[ -d "$dir" ]] || continue
    for file in "$dir"/*.env; do
      [[ -f "$file" && "$file" != "$own" ]] || continue
      sed -n 's/^APP_PORT=\([0-9][0-9]*\)$/\1/p' "$file"
    done
  done < <(worktree_state_dirs)
}

find_free_port() {
  local port claimed
  claimed=" $(claimed_ports | tr '\n' ' ') "
  for ((port = APP_PORT_START; port <= APP_PORT_END; port++)); do
    [[ "$claimed" == *" $port "* ]] && continue
    if ! port_is_in_use "$port"; then
      printf '%s' "$port"
      return 0
    fi
  done
  usage_error "No free port found in range ${APP_PORT_START}-${APP_PORT_END}"
}

# --- allocation lock ---
# mkdir is atomic everywhere and macOS has no flock by default. The lock dir
# holds the owner's pid so a crashed owner's lock can be recognised as stale.

worktree_lock_dir() {
  if [[ -n "${WORKTREE_LOCK_DIR:-}" ]]; then
    printf '%s' "$WORKTREE_LOCK_DIR"
    return 0
  fi
  local common
  common="$(git -C "$REPO_ROOT" rev-parse --path-format=absolute --git-common-dir)"
  printf '%s/groovenet-worktree-port.lock' "$common"
}

path_mtime() {
  stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || echo 0
}

# lock_is_stale: owner pid is gone, or (no pid recorded) the lock is old.
lock_is_stale() {
  local lock="$1" pid
  pid="$(cat "$lock/pid" 2>/dev/null || true)"
  if [[ -n "$pid" ]]; then
    ! kill -0 "$pid" 2>/dev/null
    return
  fi
  (($(date +%s) - $(path_mtime "$lock") > ${WORKTREE_LOCK_STALE_SECONDS:-60}))
}

# acquire_worktree_lock runs in a subshell that sets the EXIT trap, so the
# trap neither leaks into nor clobbers the caller's.
acquire_worktree_lock() {
  local lock deadline
  lock="$(worktree_lock_dir)"
  deadline=$((SECONDS + ${WORKTREE_LOCK_TIMEOUT_SECONDS:-30}))
  until mkdir "$lock" 2>/dev/null; do
    if [[ -d "$lock" ]] && lock_is_stale "$lock"; then
      # Rename first: only one waiter wins the mv, the rest retry mkdir.
      if mv "$lock" "$lock.stale.$BASHPID" 2>/dev/null; then
        rm -rf "$lock.stale.$BASHPID"
      fi
      continue
    fi
    if ((SECONDS >= deadline)); then
      usage_error "Timed out waiting for port allocation lock: $lock"
    fi
    sleep 0.1
  done
  printf '%s' "$BASHPID" >"$lock/pid"
}

release_worktree_lock() {
  rm -rf "$(worktree_lock_dir)"
}

# create_worktree_env finds a port and writes the env file under the lock, so
# concurrent setups can't both pick the same port. If this worktree's file
# appeared while waiting, its existing claim is kept.
create_worktree_env() {
  local env_file
  env_file="$(worktree_env_file)"
  (
    acquire_worktree_lock
    trap release_worktree_lock EXIT
    [[ -f "$env_file" ]] && exit 0
    local slug project host port
    slug="$(worktree_slug "$REPO_ROOT" "$CURRENT_BRANCH")"
    project="$(compose_project_name "$REPO_ROOT" "$CURRENT_BRANCH")"
    host="$(worktree_host)"
    port="$(find_free_port)"
    cat >"$env_file" <<EOF
WORKTREE_SLUG=$slug
COMPOSE_PROJECT_NAME=$project
WORKTREE_HOST=$host
APP_PORT=$port
EOF
  )
}

load_worktree_env() {
  local env_file
  env_file="$(worktree_env_file)"
  [[ -f "$env_file" ]] || usage_error "Missing worktree env file: $env_file"
  # shellcheck disable=SC1090
  source "$env_file"
}

ensure_worktree_env() {
  local env_file
  ensure_dirs
  env_file="$(worktree_env_file)"
  [[ -f "$env_file" ]] || create_worktree_env

  ensure_worktree_audio_mount_env "$env_file"
  load_worktree_env
}

default_worktree_audio_mount() {
  local music_mount="${MUSIC_MOUNT:-}"

  if [[ -z "$music_mount" ]]; then
    if [[ -d "/Volumes/music" ]]; then
      music_mount="/Volumes/music"
    elif [[ -d "$HOME/groovenet-music" ]]; then
      music_mount="$HOME/groovenet-music"
    fi
  fi

  if [[ -n "$music_mount" ]]; then
    printf '%s:/app/audio' "$music_mount"
  fi
}

ensure_worktree_audio_mount_env() {
  local env_file="$1"
  local default_mount

  default_mount="$(default_worktree_audio_mount)"
  [[ -n "$default_mount" ]] || return 0

  if ! grep -q '^APP_AUDIO_MOUNT=' "$env_file"; then
    printf 'APP_AUDIO_MOUNT=%s\n' "$default_mount" >>"$env_file"
  fi

  if ! grep -q '^WORKER_AUDIO_MOUNT=' "$env_file"; then
    printf 'WORKER_AUDIO_MOUNT=%s\n' "$default_mount" >>"$env_file"
  fi
}

compose_files=(
  "$COMPOSE_DIR/docker-compose.yml"
  "$COMPOSE_DIR/docker-compose.dev.yml"
  "$COMPOSE_DIR/docker-compose.worktree.yml"
)

if [[ "$(uname -s)" == "Darwin" ]]; then
  compose_files+=("$COMPOSE_DIR/docker-compose.mac.yml")
fi

compose_args_array() {
  local -n out_args=$1
  local compose_file
  out_args=(--project-directory "$COMPOSE_DIR")
  for compose_file in "${compose_files[@]}"; do
    out_args+=(-f "$compose_file")
  done
}

# op_injection_available: 1Password injection can work (op installed, signed
# in, and a template exists). Checked up front so a compose failure is never
# mistaken for an injection failure.
op_injection_available() {
  command -v op >/dev/null 2>&1 \
    && [[ -f "$COMPOSE_DIR/.env.tpl" ]] \
    && op whoami >/dev/null 2>&1
}

# run_compose runs "docker compose <args>", injecting secrets via 1Password
# when available and otherwise falling back to plain compose with a warning.
# Compose's own exit status is returned as-is; it is never retried.
run_compose() {
  if op_injection_available; then
    op run --env-file="$COMPOSE_DIR/.env.tpl" -- \
      env \
        COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-}" \
        WORKTREE_HOST="${WORKTREE_HOST:-}" \
        APP_PORT="${APP_PORT:-}" \
        APP_AUDIO_MOUNT="${APP_AUDIO_MOUNT:-}" \
        WORKER_AUDIO_MOUNT="${WORKER_AUDIO_MOUNT:-}" \
        docker compose "$@"
    return
  fi
  if command -v op >/dev/null 2>&1 && [[ -f "$COMPOSE_DIR/.env.tpl" ]]; then
    echo "Warning: 1Password is unavailable (locked or signed out); running docker compose without env injection" >&2
  fi
  docker compose "$@"
}

compose_exec() {
  local compose_args=()
  compose_args_array compose_args
  ensure_worktree_env
  (
    set -a
    # shellcheck disable=SC1090
    source "$(worktree_env_file)"
    set +a
    cd "$REPO_ROOT"
    run_compose "${compose_args[@]}" "$@"
  )
}

detect_running_compose_project() {
  local compose_workdir project
  compose_workdir="$(cd "$COMPOSE_DIR" && pwd)"
  project="$(
    docker ps \
      --filter "label=com.docker.compose.project.working_dir=$compose_workdir" \
      --filter "label=com.docker.compose.service=db" \
      --format '{{.Label "com.docker.compose.project"}}' \
      | head -n 1
  )"
  [[ -n "$project" ]] || return 1
  printf '%s' "$project"
}

compose_exec_detect() {
  local detected_project="${1:-}"
  local compose_args=()
  compose_args_array compose_args
  shift || true
  (
    cd "$REPO_ROOT"
    if [[ -z "$detected_project" ]]; then
      detected_project="$(detect_running_compose_project || true)"
    fi
    if [[ -n "$detected_project" ]]; then
      export COMPOSE_PROJECT_NAME="$detected_project"
    fi
    run_compose "${compose_args[@]}" "$@"
  )
}

wait_for_db() {
  local attempts="${1:-60}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    if compose_exec exec -T db sh -lc 'pg_isready -U "${POSTGRES_USER:-djplaylist}" >/dev/null 2>&1'; then
      return 0
    fi
    sleep 1
  done
  usage_error "Timed out waiting for PostgreSQL"
}

wait_for_db_detect() {
  local project_name="$1"
  local attempts="${2:-60}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    if compose_exec_detect "$project_name" exec -T db sh -lc 'pg_isready -U "${POSTGRES_USER:-djplaylist}" >/dev/null 2>&1'; then
      return 0
    fi
    sleep 1
  done
  usage_error "Timed out waiting for PostgreSQL in compose project $project_name"
}

database_is_empty() {
  local result
  result="$(
    compose_exec exec -T db sh -lc '
      export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
      psql -U "${POSTGRES_USER:-djplaylist}" -d "${POSTGRES_DB:-djplaylist}" -tAc \
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '\''public'\'';"
    ' | tr -d '[:space:]'
  )"
  [[ "$result" == "0" ]]
}

app_container_id() {
  compose_exec ps -q app | tr -d '[:space:]'
}

write_caddy_fragment() {
  ensure_worktree_env
  mkdir -p "$CADDY_WORKTREE_DIR"
  cat >"$(caddy_fragment_file)" <<EOF
$WORKTREE_HOST {
  tls internal
  reverse_proxy 127.0.0.1:$APP_PORT
}
EOF
}

reload_caddy() {
  require_command caddy
  if [[ -f "$CADDY_CONFIG_FILE" ]]; then
    caddy reload --config "$CADDY_CONFIG_FILE" --address "$CADDY_ADMIN_ADDRESS"
    return
  fi
  caddy reload --address "$CADDY_ADMIN_ADDRESS"
}

copy_optional_dir_from_container() {
  local container_id="$1"
  local source_path="$2"
  local target_path="$3"

  rm -rf "$target_path"
  mkdir -p "$target_path"

  if ! docker cp "$container_id:$source_path/." "$target_path/" >/dev/null 2>&1; then
    rm -rf "$target_path"
  fi
}
