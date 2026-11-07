#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<USAGE
Usage: $0 --restore-target <path> [options]

Required:
  --restore-target PATH   Restic restore target directory (from: restic restore ... --target PATH)

Optional:
  --app-container NAME    Running app container name (default: groovenet_webapp)
  --music-volume NAME     Fallback Docker volume for /app/audio (default: teststack_music_data)
  --covers-volume NAME    Fallback Docker volume for /app/public/uploads/album-covers (default: teststack_album_covers)
  --dumps-volume NAME     Fallback Docker volume for /app/dumps (default: teststack_db_dumps)
  --dry-run               Print planned actions only

Examples:
  $0 --restore-target /tmp/restore
  $0 --restore-target /tmp/restore --dry-run
  $0 --restore-target /tmp/restore --app-container groovenet_webapp
  $0 --restore-target /tmp/restore --music-volume my_music_volume
USAGE
}

RESTORE_TARGET=""
APP_CONTAINER="${APP_CONTAINER:-groovenet_webapp}"
MUSIC_VOLUME="${MUSIC_VOLUME:-teststack_music_data}"
COVERS_VOLUME="${COVERS_VOLUME:-teststack_album_covers}"
DUMPS_VOLUME="${DUMPS_VOLUME:-teststack_db_dumps}"
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --restore-target)
      RESTORE_TARGET="${2:-}"
      shift 2
      ;;
    --music-volume)
      MUSIC_VOLUME="${2:-}"
      shift 2
      ;;
    --app-container)
      APP_CONTAINER="${2:-}"
      shift 2
      ;;
    --covers-volume)
      COVERS_VOLUME="${2:-}"
      shift 2
      ;;
    --dumps-volume)
      DUMPS_VOLUME="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$RESTORE_TARGET" ]]; then
  echo "Error: --restore-target is required"
  usage
  exit 1
fi

if [[ ! -d "$RESTORE_TARGET" ]]; then
  echo "Error: restore target directory not found: $RESTORE_TARGET"
  exit 1
fi

resolve_dir() {
  local base="$1"
  shift
  for rel in "$@"; do
    if [[ -d "$base/$rel" ]]; then
      echo "$base/$rel"
      return 0
    fi
  done
  return 1
}

copy_dir_contents_to_volume() {
  local src_dir="$1"
  local volume_name="$2"
  local label="$3"

  if [[ "$DRY_RUN" == true ]]; then
    echo "[dry-run] Copy $label"
    echo "          from: $src_dir"
    echo "          to volume: $volume_name"
    return 0
  fi

  docker volume inspect "$volume_name" >/dev/null

  docker run --rm \
    -v "$volume_name:/dest" \
    -v "$src_dir:/src:ro" \
    alpine:3.20 \
    sh -lc 'mkdir -p /dest && cp -a /src/. /dest/'

  echo "Copied $label -> $volume_name"
}

# Dev stacks share one host covers folder, so parallel worktree launches can
# restore into it at once. Serialize them with an atomic mkdir lock taken inside
# the container (no flock on macOS hosts), break a lock older than
# RESTORE_LOCK_STALE_SECS as left by a crashed run, and copy no-clobber so a
# second launch only adds what is missing. Runs under BusyBox ash (alpine:3.20):
# its cp supports -n, and stat -c %Y / date +%s work; GNU-only flags are avoided.
BIND_RESTORE_SCRIPT='
lock=/dest/.restore.lock
stale="${RESTORE_LOCK_STALE_SECS:-300}"
mkdir -p /dest
until mkdir "$lock" 2>/dev/null; do
  mtime="$(stat -c %Y "$lock" 2>/dev/null || true)"
  if [ -n "$mtime" ] && [ $(( $(date +%s) - mtime )) -gt "$stale" ]; then
    echo "Breaking stale restore lock $lock" >&2
    # Rename first so only one waiter wins the break.
    if mv "$lock" "$lock.stale.$$" 2>/dev/null; then
      rm -rf "$lock.stale.$$"
    fi
    continue
  fi
  sleep 1
done
trap '"'"'rmdir "$lock" 2>/dev/null || true'"'"' EXIT
# BusyBox "cp -an /src/. /dest/" silently copies nothing: -n treats the existing
# /dest/. as the file to keep. So create the tree, then copy each file no-clobber.
cd /src
find . -type d -exec mkdir -p /dest/{} \;
find . ! -type d -exec sh -c '"'"'for f; do cp -an "$f" "/dest/$f"; done'"'"' sh {} +
'

copy_dir_contents_to_bind() {
  local src_dir="$1"
  local bind_path="$2"
  local label="$3"

  if [[ "$DRY_RUN" == true ]]; then
    echo "[dry-run] Copy $label"
    echo "          from: $src_dir"
    echo "          to bind path: $bind_path (no-clobber: existing files are kept)"
    return 0
  fi

  mkdir -p "$bind_path"
  docker run --rm \
    -e RESTORE_LOCK_STALE_SECS="${RESTORE_LOCK_STALE_SECS:-300}" \
    -v "$bind_path:/dest" \
    -v "$src_dir:/src:ro" \
    alpine:3.20 \
    sh -c "$BIND_RESTORE_SCRIPT"

  echo "Copied $label -> bind:$bind_path"
}

get_mount_type_and_source() {
  local destination="$1"
  local line
  line="$(docker inspect "$APP_CONTAINER" --format '{{range .Mounts}}{{println .Destination "|" .Type "|" .Source "|" .Name}}{{end}}' 2>/dev/null | grep "^${destination} |" || true)"
  if [[ -z "$line" ]]; then
    return 1
  fi

  # shellcheck disable=SC2034
  local _dest _sep mount_type source name
  IFS='|' read -r _dest mount_type source name <<<"$line"
  mount_type="$(echo "$mount_type" | xargs)"
  source="$(echo "$source" | xargs)"
  name="$(echo "$name" | xargs)"
  echo "${mount_type}|${source}|${name}"
}

copy_dir_to_target_mount() {
  local src_dir="$1"
  local destination="$2"
  local fallback_volume="$3"
  local label="$4"
  local mount_info mount_type source name

  mount_info="$(get_mount_type_and_source "$destination" || true)"
  if [[ -n "$mount_info" ]]; then
    IFS='|' read -r mount_type source name <<<"$mount_info"
    if [[ "$mount_type" == "bind" ]]; then
      copy_dir_contents_to_bind "$src_dir" "$source" "$label"
      return 0
    fi
    if [[ "$mount_type" == "volume" ]]; then
      copy_dir_contents_to_volume "$src_dir" "$name" "$label"
      return 0
    fi
    echo "Unsupported mount type '$mount_type' for $destination; using fallback volume: $fallback_volume"
  else
    echo "Could not inspect mount for $destination on container '$APP_CONTAINER'; using fallback volume: $fallback_volume"
  fi

  copy_dir_contents_to_volume "$src_dir" "$fallback_volume" "$label"
}

AUDIO_SRC=""
COVERS_SRC=""
DUMPS_SRC=""

if AUDIO_SRC="$(resolve_dir "$RESTORE_TARGET" app/audio audio 2>/dev/null)"; then
  :
fi
if COVERS_SRC="$(resolve_dir "$RESTORE_TARGET" app/public/uploads/album-covers public/uploads/album-covers 2>/dev/null)"; then
  :
fi
if DUMPS_SRC="$(resolve_dir "$RESTORE_TARGET" app/dumps dumps 2>/dev/null)"; then
  :
fi

echo "Restore target: $RESTORE_TARGET"
echo "App container: $APP_CONTAINER"
echo "Music volume : $MUSIC_VOLUME"
echo "Covers volume: $COVERS_VOLUME"
echo "Dumps volume : $DUMPS_VOLUME"

if [[ -n "$AUDIO_SRC" ]]; then
  copy_dir_to_target_mount "$AUDIO_SRC" "/app/audio" "$MUSIC_VOLUME" "audio files"
else
  echo "Skip audio: no source folder found under restore target"
fi

if [[ -n "$COVERS_SRC" ]]; then
  copy_dir_to_target_mount "$COVERS_SRC" "/app/public/uploads/album-covers" "$COVERS_VOLUME" "album covers"
else
  echo "Skip covers: no source folder found under restore target"
fi

if [[ -n "$DUMPS_SRC" ]]; then
  copy_dir_to_target_mount "$DUMPS_SRC" "/app/dumps" "$DUMPS_VOLUME" "database dumps"
else
  echo "Skip dumps: no source folder found under restore target"
fi

echo "Done."
