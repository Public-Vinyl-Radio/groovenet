#!/bin/sh
set -e

# Mounted volumes/bind-mounts don't inherit the image's ownership, so the app
# (running as nextjs) can't write to them. Fix ownership at startup, then drop
# privileges. Recurse on small metadata dirs (may contain root-owned files from
# older images); only touch the top level of large media dirs to keep startup fast.
RECURSIVE_DIRS="/app/dumps /app/discogs_exports /app/cookies /app/essentia-data"
TOPLEVEL_DIRS="/app/audio /app/audio-ingest /app/public/uploads/album-covers"

for dir in $RECURSIVE_DIRS; do
  [ -d "$dir" ] && chown -R nextjs:nodejs "$dir" 2>/dev/null || true
done

for dir in $TOPLEVEL_DIRS; do
  [ -d "$dir" ] && chown nextjs:nodejs "$dir" 2>/dev/null || true
done

exec gosu nextjs "$@"
