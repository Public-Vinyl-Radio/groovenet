#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

REMOTE_HOST="${PROD_SEED_HOST:-}"
REMOTE_DB_CONTAINER="${PROD_SEED_DB_CONTAINER:-groovenet_db}"
REMOTE_APP_CONTAINER="${PROD_SEED_APP_CONTAINER:-groovenet_webapp}"
REMOTE_COVERS_PATH="${PROD_SEED_COVERS_PATH:-}"
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

Read-only on prod: pg_dump runs inside the prod db container over SSH and
album covers are streamed from the app container with tar.

Host defaults to \$PROD_SEED_HOST. Overrides: PROD_SEED_DB_CONTAINER
(default groovenet_db), PROD_SEED_APP_CONTAINER (default groovenet_webapp).
PROD_SEED_COVERS_PATH selects a host directory instead of the app container;
that override needs passwordless sudo or a password at the local terminal.
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

# Keep the archive on a non-PTY SSH channel: a PTY merges sudo prompts into
# stdout and can translate bytes, corrupting or blocking the tar stream.
sudo_password=""
if [[ "$INCLUDE_COVERS" == true && -z "$REMOTE_COVERS_PATH" ]]; then
  echo "Checking album covers in $REMOTE_HOST:$REMOTE_APP_CONTAINER"
  ssh -T "$REMOTE_HOST" "docker exec $REMOTE_APP_CONTAINER sh -c 'command -v tar >/dev/null && test -d /app/public/uploads/album-covers'" </dev/null
elif [[ "$INCLUDE_COVERS" == true ]]; then
  echo "Checking sudo access for album covers on $REMOTE_HOST"
  if ! ssh -T "$REMOTE_HOST" 'sudo -n true' </dev/null; then
    [[ -t 0 ]] || usage_error "Album covers require sudo. Run from a terminal to enter a password, configure passwordless sudo, or use --no-covers."
    read -r -s -p "Sudo password for $REMOTE_HOST: " sudo_password
    printf '\n' >&2
    printf '%s\n' "$sudo_password" | ssh -T "$REMOTE_HOST" "sudo -S -p '' -v"
  fi
  printf '%s\n' "$sudo_password" \
    | ssh -T "$REMOTE_HOST" "sudo -S -p '' test -d \"$REMOTE_COVERS_PATH\""
fi
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
  # Archive the mounted directory inside the app, independent of Docker's
  # host storage path or Compose volume name. Keep stdout binary-only.
  if [[ -z "$REMOTE_COVERS_PATH" ]]; then
    echo "Streaming album covers from $REMOTE_HOST:$REMOTE_APP_CONTAINER:/app/public/uploads/album-covers"
    ssh -T "$REMOTE_HOST" "docker exec $REMOTE_APP_CONTAINER tar -C /app/public/uploads/album-covers -cf - ." </dev/null \
      | tar -C "$covers_dir" -xvf -
  else
    echo "Streaming album covers from $REMOTE_HOST:$REMOTE_COVERS_PATH"
    printf '%s\n' "$sudo_password" \
      | ssh -T "$REMOTE_HOST" "sudo -S -p '' tar -C \"$REMOTE_COVERS_PATH\" -cf - ." \
      | tar -C "$covers_dir" -xvf -
  fi
fi
unset sudo_password

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
