#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
out="$root/build-knulli"
mkdir -p "$out"
version=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$root/../../package.json")
case "$version" in *[!0-9.]*|"") echo 'Invalid root package version' >&2; exit 1;; esac
printf '%s\n' "$version" > "$out/version.txt"
git -C "$root" rev-parse HEAD > "$out/source-version.txt"
git -C "$root" diff --binary HEAD -- . | shasum -a 256 >> "$out/source-version.txt"
docker build --platform linux/amd64 -t groovenet-brick-knulli-builder "$root/knulli"
docker run --rm --platform linux/amd64 --network none \
  -v "$root:/src:ro" -v "$root/../../LICENSE:/project-license:ro" -v "$out:/out" groovenet-brick-knulli-builder \
  sh /src/knulli/package.sh
