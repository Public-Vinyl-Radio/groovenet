#!/bin/sh
# Points the standalone server's working directory at the mounted volumes.
#
# Next's generated server.js calls process.chdir(__dirname), moving the process
# into the directory outputFileTracingRoot nests it under (my-collection-search/,
# because next.config.mjs traces from the monorepo root), not the image's WORKDIR.
# App code that resolves a path off process.cwd() (cookies, dumps, discogs_exports,
# audio, audio-ingest, essentia-data, public/uploads/album-covers; see
# cookieUtils.ts, backupRunnerService.ts, albumArtworkService.ts) only finds the
# volumes if a link to each exists in *that* directory. The directory is found
# rather than hardcoded: maxdepth 2 is server.js's real depth under /app/my-collection-search
# (anything in its node_modules sits much deeper), so this only ever matches the
# real one. A dev container with no standalone build matches nothing and is
# skipped: process.cwd() there is already the bind-mounted checkout.
#
# Run once at image build (the root filesystem is read-only at runtime, #1074) and
# again by entrypoint.sh, where it changes nothing unless a link is missing or wrong.
set -e

server_js="$(find /app/my-collection-search -maxdepth 2 -name server.js 2>/dev/null | head -n1)"
[ -n "$server_js" ] || exit 0

# Guard on the find result itself, not dirname's output: dirname of an empty
# string is ".", so a missing server.js would look like a match on WORKDIR and
# rm -rf a live mounted volume (cookie_data) out from under it.
app_dir="$(dirname "$server_js")"

link() {
  [ "$(readlink "$2" 2>/dev/null)" = "$1" ] && return 0
  rm -rf "${2:?}"
  ln -sfn "$1" "$2"
  # Own what a root build step created; a no-op (and harmless) for nextjs.
  chown -h nextjs:nodejs "$2" 2>/dev/null || true
}

mkdir -p "$app_dir/public/uploads"
chown nextjs:nodejs "$app_dir/public/uploads" 2>/dev/null || true
for name in cookies dumps discogs_exports audio audio-ingest essentia-data; do
  link "/app/$name" "$app_dir/$name"
done
link /app/public/uploads/album-covers "$app_dir/public/uploads/album-covers"
