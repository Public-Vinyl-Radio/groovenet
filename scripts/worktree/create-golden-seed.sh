#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

INCLUDE_AUDIO=false
PROJECT_NAME_OVERRIDE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      continue
      ;;
    --include-audio)
      INCLUDE_AUDIO=true
      shift
      ;;
    --project-name)
      PROJECT_NAME_OVERRIDE="${2:-}"
      [[ -n "$PROJECT_NAME_OVERRIDE" ]] || usage_error "--project-name requires a value"
      shift 2
      ;;
    -h|--help)
      cat <<EOF
Usage: $(basename "$0") [--include-audio] [--project-name NAME]

Creates a golden seed bundle from the currently running stack for this repo.
The bundle includes a PostgreSQL custom-format dump and selected app assets.
EOF
      exit 0
      ;;
    *)
      usage_error "Unknown argument: $1"
      ;;
  esac
done

require_command docker
mkdir -p "$SEED_ROOT"

project_name="$PROJECT_NAME_OVERRIDE"
if [[ -z "$project_name" && -f "$(worktree_env_file)" ]]; then
  load_worktree_env
  project_name="${COMPOSE_PROJECT_NAME:-}"
fi
if [[ -z "$project_name" ]]; then
  project_name="$(detect_running_compose_project || true)"
fi
[[ -n "$project_name" ]] || usage_error "Could not determine a running compose project. Use --project-name."

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
bundle_dir="$SEED_ROOT/$stamp"
latest_link="$SEED_ROOT/latest"
mkdir -p "$bundle_dir"

compose_exec_detect "$project_name" up -d db app >/dev/null
wait_for_db_detect "$project_name"

echo "Creating golden dump from compose project $project_name"
compose_exec_detect "$project_name" exec -T db sh -lc '
  export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
  pg_dump \
    -U "${POSTGRES_USER:-djplaylist}" \
    -d "${POSTGRES_DB:-djplaylist}" \
    --format=custom \
    --no-owner \
    --no-acl
' >"$bundle_dir/db.dump"

app_container="$(
  compose_exec_detect "$project_name" ps -q app | tr -d '[:space:]'
)"
[[ -n "$app_container" ]] || usage_error "Could not locate app container for project $project_name"

copy_optional_dir_from_container "$app_container" /app/public/uploads/album-covers "$bundle_dir/app/public/uploads/album-covers"
copy_optional_dir_from_container "$app_container" /app/dumps "$bundle_dir/app/dumps"

if [[ "$INCLUDE_AUDIO" == true ]]; then
  copy_optional_dir_from_container "$app_container" /app/audio "$bundle_dir/app/audio"
fi

cat >"$bundle_dir/manifest.json" <<EOF
{
  "created_at": "$stamp",
  "compose_project": "$project_name",
  "repo_root": "$REPO_ROOT",
  "git_branch": "$(worktree_branch_name "$REPO_ROOT" "$CURRENT_BRANCH")",
  "git_commit": "$(git -C "$REPO_ROOT" rev-parse HEAD)",
  "include_audio": $INCLUDE_AUDIO
}
EOF

ln -sfn "$bundle_dir" "$latest_link"

echo "Golden seed created at $bundle_dir"
echo "Latest seed link updated: $latest_link"
