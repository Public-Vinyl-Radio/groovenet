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
SEED_ROOT="${SEED_ROOT:-$HOME/.supacode/worktree-seeds/$REPO_NAME}"
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

find_free_port() {
  local port
  for ((port = APP_PORT_START; port <= APP_PORT_END; port++)); do
    if ! port_is_in_use "$port"; then
      printf '%s' "$port"
      return 0
    fi
  done
  usage_error "No free port found in range ${APP_PORT_START}-${APP_PORT_END}"
}

load_worktree_env() {
  local env_file
  env_file="$(worktree_env_file)"
  [[ -f "$env_file" ]] || usage_error "Missing worktree env file: $env_file"
  # shellcheck disable=SC1090
  source "$env_file"
}

ensure_worktree_env() {
  local env_file slug project host port
  ensure_dirs
  env_file="$(worktree_env_file)"
  if [[ -f "$env_file" ]]; then
    ensure_worktree_audio_mount_env "$env_file"
    load_worktree_env
    return 0
  fi

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
    if command -v op >/dev/null 2>&1 && [[ -f "$COMPOSE_DIR/.env.tpl" ]]; then
      if ! op run --env-file="$COMPOSE_DIR/.env.tpl" -- \
        env \
          COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-}" \
          WORKTREE_HOST="${WORKTREE_HOST:-}" \
          APP_PORT="${APP_PORT:-}" \
          APP_AUDIO_MOUNT="${APP_AUDIO_MOUNT:-}" \
          WORKER_AUDIO_MOUNT="${WORKER_AUDIO_MOUNT:-}" \
          docker compose "${compose_args[@]}" "$@"; then
        echo "Warning: falling back to docker compose without 1Password env injection" >&2
        docker compose "${compose_args[@]}" "$@"
      fi
    else
      docker compose "${compose_args[@]}" "$@"
    fi
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
    if command -v op >/dev/null 2>&1 && [[ -f "$COMPOSE_DIR/.env.tpl" ]]; then
      if ! op run --env-file="$COMPOSE_DIR/.env.tpl" -- \
        env \
          COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-}" \
          WORKTREE_HOST="${WORKTREE_HOST:-}" \
          APP_PORT="${APP_PORT:-}" \
          APP_AUDIO_MOUNT="${APP_AUDIO_MOUNT:-}" \
          WORKER_AUDIO_MOUNT="${WORKER_AUDIO_MOUNT:-}" \
          docker compose "${compose_args[@]}" "$@"; then
        echo "Warning: falling back to docker compose without 1Password env injection" >&2
        docker compose "${compose_args[@]}" "$@"
      fi
    else
      docker compose "${compose_args[@]}" "$@"
    fi
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
