#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
out="$root/build-knulli"
mkdir -p "$out"
git -C "$root" rev-parse HEAD > "$out/source-version.txt"
git -C "$root" diff --binary HEAD -- . | shasum -a 256 >> "$out/source-version.txt"
docker build --platform linux/arm64 -t groovenet-brick-knulli-preview "$root/knulli"
docker run --rm --platform linux/arm64 --network none \
  -v "$root:/src:ro" -v "$out:/out" groovenet-brick-knulli-preview \
  sh /src/knulli/package.sh
