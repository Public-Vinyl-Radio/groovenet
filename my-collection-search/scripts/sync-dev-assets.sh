#!/usr/bin/env bash
# Rsyncs album covers from beelink for local dev.
# Audio is served via NFS mount (see `just mount-music`).
# Requires passwordless sudo for rsync on beelink:
#   echo 'saegey ALL=(ALL) NOPASSWD: /usr/bin/rsync' | sudo tee /etc/sudoers.d/rsync-saegey
set -euo pipefail

BEELINK_HOST="${BEELINK_HOST:-saegey@100.117.118.15}"
COVERS_LOCAL_DIR="${COVERS_LOCAL_DIR:-$HOME/groovenet-covers}"
COVERS_REMOTE_PATH="${COVERS_REMOTE_PATH:-/var/lib/docker/volumes/groovenet_album_covers/_data}"

mkdir -p "$COVERS_LOCAL_DIR"

echo "→ Syncing album covers from $BEELINK_HOST..."
rsync -avz --rsync-path='sudo rsync' \
  "$BEELINK_HOST":"$COVERS_REMOTE_PATH"/ \
  "$COVERS_LOCAL_DIR/"

echo "✓ Covers sync complete."
