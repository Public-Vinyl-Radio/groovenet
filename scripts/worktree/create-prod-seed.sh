#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

REMOTE_HOST="${PROD_SEED_HOST:-}"
REMOTE_DB_CONTAINER="${PROD_SEED_DB_CONTAINER:-groovenet_db}"
REMOTE_COVERS_PATH="${PROD_SEED_COVERS_PATH:-/var/lib/docker/volumes/groovenet_album_covers/_data}"
INCLUDE_COVERS=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      continue
      ;;
    --host)
      REMOTE_HOST="${2:-}"
      [[ -n "$REMOTE_HOST" ]] || usage_error "--host requires user@host"
      shift 2
      ;;
    --no-covers)
      INCLUDE_COVERS=false
      shift
      ;;
    -h|--help)
      cat <<USAGE
Usage: $(basename "$0") [--host USER@HOST] [--no-covers]

Creates a golden seed bundle from PRODUCTION, in the same layout as
create-golden-seed.sh so worktree setup restores it unchanged.

Read-only on prod: pg_dump runs inside the prod db container over SSH and the
album covers volume is streamed with tar. Nothing on the server is modified.

Host defaults to \$PROD_SEED_HOST. Overrides: PROD_SEED_DB_CONTAINER
(default groovenet_db), PROD_SEED_COVERS_PATH (prod album_covers volume).
Covers need passwordless or interactive sudo on the host.
USAGE
      exit 0
      ;;
    *)
      usage_error "Unknown argument: $1"
      ;;
  esac
done

require_command ssh
require_command tar
[[ -n "$REMOTE_HOST" ]] || usage_error "Set PROD_SEED_HOST or pass --host user@host."
mkdir -p "$SEED_ROOT"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
bundle_dir="$SEED_ROOT/$stamp"
mkdir -p "$bundle_dir"
trap 'rm -rf "$bundle_dir"' ERR

echo "Dumping prod database from $REMOTE_HOST ($REMOTE_DB_CONTAINER)"
ssh "$REMOTE_HOST" "docker exec -i $REMOTE_DB_CONTAINER sh -lc '
  export PGPASSWORD=\"\${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}\"
  pg_dump \
    -U \"\${POSTGRES_USER:-djplaylist}\" \
    -d \"\${POSTGRES_DB:-djplaylist}\" \
    --format=custom \
    --no-owner \
    --no-acl
'" >"$bundle_dir/db.dump"
[[ -s "$bundle_dir/db.dump" ]] || usage_error "Prod dump came back empty"

if [[ "$INCLUDE_COVERS" == true ]]; then
  covers_dir="$bundle_dir/app/public/uploads/album-covers"
  mkdir -p "$covers_dir"
  echo "Streaming album covers from $REMOTE_HOST:$REMOTE_COVERS_PATH"
  # -t lets sudo prompt; tar over SSH reads the root-owned docker volume.
  ssh -t "$REMOTE_HOST" "sudo tar -C \"$REMOTE_COVERS_PATH\" -cf - ." | tar -C "$covers_dir" -xf -
fi

cat >"$bundle_dir/manifest.json" <<MANIFEST
{
  "created_at": "$stamp",
  "source": "prod",
  "remote_host": "$REMOTE_HOST",
  "git_commit": "$(git -C "$REPO_ROOT" rev-parse HEAD)",
  "include_audio": false,
  "include_covers": $INCLUDE_COVERS
}
MANIFEST

trap - ERR
ln -sfn "$bundle_dir" "$SEED_ROOT/latest"

echo "Prod golden seed created at $bundle_dir"
echo "Latest seed link updated: $SEED_ROOT/latest"
