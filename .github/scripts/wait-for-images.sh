#!/usr/bin/env bash
# Wait until the images a clean-install job pulls exist in GHCR.
#   wait-for-images.sh TAG
# The push to main also starts docker-publish, which builds sha-<short> after
# its tests pass.
set -euo pipefail

tag="${1:?usage: wait-for-images.sh TAG}"
owner="${GITHUB_REPOSITORY_OWNER,,}"
for svc in webapp webapp-migrate; do
  src="ghcr.io/${owner}/${svc}:${tag}"
  for attempt in $(seq 1 90); do
    docker buildx imagetools inspect "$src" >/dev/null 2>&1 && continue 2
    echo "waiting for ${src} (attempt ${attempt}/90)..."
    sleep 30
  done
  echo "::error::candidate image ${src} never appeared"
  exit 1
done
