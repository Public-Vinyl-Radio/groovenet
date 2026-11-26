#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

SEED_MODE="auto"
SEED_DIR_OVERRIDE=""
REQUESTED_PROFILES=""
RESEED=0
ASSUME_YES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      continue
      ;;
    --profile)
      [[ -n "${2:-}" ]] || usage_error "--profile requires a value"
      REQUESTED_PROFILES="${REQUESTED_PROFILES:+$REQUESTED_PROFILES,}$2"
      shift 2
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
    --reseed)
      RESEED=1
      shift
      ;;
    --yes|-y)
      ASSUME_YES=1
      shift
      ;;
    -h|--help)
      cat <<EOF
Usage: $(basename "$0") [--no-seed] [--seed PATH] [--profile NAME] [--reseed [--yes]]

Bootstraps the current git worktree with:
- a unique Docker Compose project
- a loopback app port
- a Caddy vhost fragment with local TLS
- optional database seed restore from the latest golden dump

--reseed drops this worktree's database contents and restores the seed again
(after confirmation, or --yes). Other volumes, and other worktrees, are untouched.
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
# Decide once, here in the top-level shell, so every compose call below reuses it.
op_injection_resolve
if [[ -n "$REQUESTED_PROFILES" ]]; then
  save_profiles "$(normalize_profiles "${COMPOSE_PROFILES:+$COMPOSE_PROFILES,}$REQUESTED_PROFILES")"
fi
write_caddy_fragment
reload_caddy
# Only the datastores first: `app` waits on the one-shot `migrate` service, so
# starting everything here would migrate the empty database before the seed
# restore below, which only runs on a database with no tables.
compose_exec up -d --remove-orphans db redis
wait_for_db
restore_assets=0

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

force_restore=0
if [[ "$RESEED" == "1" ]]; then
  [[ "$SEED_MODE" != "skip" ]] || usage_error "--reseed cannot be combined with --no-seed"
  [[ -f "$seed_dir/db.dump" ]] || usage_error "--reseed needs a seed, but no db.dump found at $seed_dir"
  if [[ "$ASSUME_YES" != "1" ]]; then
    [[ -t 0 ]] || usage_error "--reseed would erase this worktree's database; pass --yes to confirm non-interactively"
    read -r -p "Erase the database of $COMPOSE_PROJECT_NAME and restore $seed_dir? [y/N] " answer
    [[ "$answer" == [yY]* ]] || usage_error "Reseed cancelled"
  fi
  # Release any connections held by the app and workers before dropping the schema.
  to_stop=()
  while IFS= read -r service; do
    case "$service" in ""|db|redis) ;; *) to_stop+=("$service") ;; esac
  done < <(compose_exec --profile '*' config --services)
  if ((${#to_stop[@]})); then compose_exec --profile '*' stop "${to_stop[@]}"; fi
  force_restore=1
fi

if [[ "$force_restore" == "1" ]] || database_is_empty; then
  if [[ "$SEED_MODE" == "skip" ]]; then
    echo "Database is empty; skipping seed restore by request."
  elif [[ -f "$seed_dir/db.dump" ]]; then
    echo "Empty database detected. Restoring golden seed from $seed_dir/db.dump"
    if ! restore_seed_database "$seed_dir/db.dump"; then
      restore_failed_message "$seed_dir/db.dump"
      exit 1
    fi

    if [[ -d "$seed_dir/app" || -d "$seed_dir/audio" || -d "$seed_dir/dumps" || -d "$seed_dir/public" ]]; then
      restore_assets=1
    fi
  elif [[ "$SEED_MODE" == "force" ]]; then
    usage_error "Seed requested, but no db.dump found at $seed_dir"
  else
    echo "Database is empty and no golden seed was found at $seed_dir"
  fi
else
  echo "Database already contains tables; skipping seed restore."
  echo "Refreshing the golden seed does not replace an existing worktree database."
  echo "To replace this worktree's database with the selected seed, run 'just worktree-up --reseed' (database only)."
fi

# Rebuild the migrator from this worktree's source, then bring up the rest of
# the stack (`up` re-runs `migrate`, a no-op here).
compose_exec run --rm --build migrate
compose_exec up -d --remove-orphans

if [[ "$restore_assets" == "1" ]]; then
  app_container="$(app_container_id)"
  "$APP_DIR/scripts/restore-restic-assets.sh" \
    --restore-target "$seed_dir" \
    --app-container "$app_container"
fi

echo
echo "Worktree ready"
echo "  URL: https://$WORKTREE_HOST"
echo "  Port: $APP_PORT"
echo "  Compose project: $COMPOSE_PROJECT_NAME"
