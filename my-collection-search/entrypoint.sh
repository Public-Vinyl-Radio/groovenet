#!/bin/sh
set -e

# The production image runs as nextjs from the start (#1074): there is nothing to
# re-own and no one to drop to, and a volume's ownership is fixed by the
# `volume-perms` init service. Started as root, which is only the dev target
# now, this still adopts the checkout's uid, re-owns the mounted volumes and
# drops privileges with gosu.
run_as=""
if [ "$(id -u)" = 0 ]; then
  run_as="gosu nextjs"
  # In dev, the host checkout is bind-mounted over /app. On Linux it keeps the
  # host user's uid, which nextjs (1001) cannot write to, so `npm ci` dies on
  # package-lock.json. Adopt the checkout owner's uid/gid instead. A no-op in the
  # production image, where /app is already owned by nextjs.
  app_uid=$(stat -c %u /app)
  app_gid=$(stat -c %g /app)
  if [ "$app_uid" != 0 ] && [ "$app_uid" != "$(id -u nextjs)" ]; then
    groupmod -o -g "$app_gid" nodejs
    usermod -o -u "$app_uid" -g "$app_gid" nextjs
  fi
  # The dev node_modules volume was seeded under the old uid; re-own it once.
  if [ -d /app/node_modules ] && [ "$(stat -c %u /app/node_modules)" != "$(id -u nextjs)" ]; then
    chown -R nextjs:nodejs /app/node_modules
  fi

  # Mounted volumes/bind-mounts don't inherit the image's ownership, so the app
  # (running as nextjs) can't write to them. Fix ownership at startup, then drop
  # privileges. Recurse on small metadata dirs (may contain root-owned files from
  # older images); only touch the top level of large media dirs to keep startup fast.
  RECURSIVE_DIRS="/app/dumps /app/discogs_exports /app/cookies /app/essentia-data"
  TOPLEVEL_DIRS="/app/audio /app/audio-ingest /app/set-recordings /app/public/uploads/album-covers"

  for dir in $RECURSIVE_DIRS; do
    [ -d "$dir" ] && chown -R nextjs:nodejs "$dir" 2>/dev/null || true
  done

  for dir in $TOPLEVEL_DIRS; do
    [ -d "$dir" ] && chown nextjs:nodejs "$dir" 2>/dev/null || true
  done
fi

# Links from the server's working directory to the volumes. Made at image build
# (the root filesystem is read-only), so this only repairs a missing one; see the script.
link-volumes.sh

# shellcheck disable=SC2086 # run_as is empty or one fixed command
exec $run_as "$@"
