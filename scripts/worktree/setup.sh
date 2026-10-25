#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

SEED_MODE="auto"
SEED_DIR_OVERRIDE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      continue
      ;;
    --no-seed)
      SEED_MODE="skip"
      shift
      ;;
    --seed)
      SEED_MODE="force"
      SEED_DIR_OVERRIDE="${2:-}"
      [[ -n "$SEED_DIR_OVERRIDE" ]] || usage_error "--seed requires a path"
      shift 2
      ;;
    -h|--help)
      cat <<EOF
Usage: $(basename "$0") [--no-seed] [--seed PATH]

Bootstraps the current git worktree with:
- a unique Docker Compose project
- a loopback app port
- a Caddy vhost fragment with local TLS
- optional database seed restore from the latest golden dump
EOF
      exit 0
      ;;
    *)
      usage_error "Unknown argument: $1"
      ;;
  esac
done

require_command git docker caddy

ensure_worktree_env
write_caddy_fragment
reload_caddy
compose_exec up -d --remove-orphans
wait_for_db

seed_dir="$(seed_bundle_dir)"
if [[ -n "$SEED_DIR_OVERRIDE" ]]; then
  seed_dir="$SEED_DIR_OVERRIDE"
fi
# Resolve latest once so a concurrent seed refresh cannot mix a database
# from one bundle with assets from another.
if [[ -d "$seed_dir" ]]; then
  seed_dir="$(cd "$seed_dir" && pwd -P)"
fi
echo "Selected golden seed: $seed_dir"

if database_is_empty; then
  if [[ "$SEED_MODE" == "skip" ]]; then
    echo "Database is empty; skipping seed restore by request."
  elif [[ -f "$seed_dir/db.dump" ]]; then
    echo "Empty database detected. Restoring golden seed from $seed_dir/db.dump"
    compose_exec exec -T db sh -lc '
      export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
      psql -U "${POSTGRES_USER:-djplaylist}" -d "${POSTGRES_DB:-djplaylist}" -v ON_ERROR_STOP=1 \
        -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"
      cat > /tmp/worktree-seed.dump
      pg_restore \
        -U "${POSTGRES_USER:-djplaylist}" \
        -d "${POSTGRES_DB:-djplaylist}" \
        --single-transaction \
        --no-owner \
        --no-acl \
        /tmp/worktree-seed.dump
      rm -f /tmp/worktree-seed.dump
    ' <"$seed_dir/db.dump"

    if [[ -d "$seed_dir/app" || -d "$seed_dir/audio" || -d "$seed_dir/dumps" || -d "$seed_dir/public" ]]; then
      app_container="$(app_container_id)"
      "$APP_DIR/scripts/restore-restic-assets.sh" \
        --restore-target "$seed_dir" \
        --app-container "$app_container"
    fi
  elif [[ "$SEED_MODE" == "force" ]]; then
    usage_error "Seed requested, but no db.dump found at $seed_dir"
  else
    echo "Database is empty and no golden seed was found at $seed_dir"
  fi
else
  echo "Database already contains tables; skipping seed restore."
  echo "Refreshing the golden seed does not replace an existing worktree database."
  echo "To recreate this worktree with the selected seed, run 'just worktree-purge' then 'just worktree-up'."
  echo "Warning: worktree-purge deletes this worktree's database and other Compose volumes."
fi

compose_exec run --rm --build migrate

echo
echo "Worktree ready"
echo "  URL: https://$WORKTREE_HOST"
echo "  Port: $APP_PORT"
echo "  Compose project: $COMPOSE_PROJECT_NAME"
