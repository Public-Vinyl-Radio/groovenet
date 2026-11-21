#!/usr/bin/env bash
# Build the install bundle (#1072): what `install.sh` downloads instead of a
# checkout.
#
#   scripts/install/build-bundle.sh VERSION [OUT_DIR] [SRC_DIR]
#
# VERSION is the app release (v0.3.19), or sha-<short> for a release-candidate
# bundle used by CI. OUT_DIR defaults to ./dist; SRC_DIR (default: this
# checkout) is where the compose files come from, so a release workflow can
# bundle a tag's files with the current script.
#
# Writes into OUT_DIR:
#   groovenet-compose-VERSION.tar.gz         the bundle
#   groovenet-compose-VERSION.tar.gz.sha256  `sha256sum`-format checksum
#
# The bundle holds, flat:
#   docker-compose.yml, docker-compose.images.yml, docker-compose.local.yml
#   .env.example
#   bundle.env           GROOVENET_VERSION=VERSION
#
# The compose files are the repository's own, unmerged, so the bundle runs
# exactly the quick start that scripts/clean-install-test.sh checks. Only one
# thing changes: the image tag default in docker-compose.images.yml becomes
# VERSION, so even a stack whose .env loses IMAGE_TAG stays on this release
# instead of drifting to `latest`. A merged `docker compose config` was
# rejected: it inlines the build contexts, resolves paths to the build host and
# drops profiles' defaults, none of which belongs on the adopter's machine.
#
# The archive is reproducible (fixed order, owner, mtime, no gzip header
# name), so rebuilding a release gives the same checksum.
set -euo pipefail

version="${1:-}"
out_dir="${2:-dist}"
src_dir="${3:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

die() {
  echo "build-bundle: $*" >&2
  exit 1
}

[[ "$version" =~ ^(v[0-9]+\.[0-9]+\.[0-9]+|sha-[0-9a-f]{7,40})$ ]] \
  || die "VERSION must be vX.Y.Z or sha-<short>, got: ${version:-<empty>}"

files=(.env.example bundle.env docker-compose.images.yml docker-compose.local.yml docker-compose.yml)
for f in docker-compose.yml docker-compose.images.yml docker-compose.local.yml .env.example; do
  [[ -f "$src_dir/$f" ]] || die "$src_dir/$f not found"
done

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

cp "$src_dir/docker-compose.yml" "$src_dir/docker-compose.local.yml" "$src_dir/.env.example" "$stage/"

# Pin the image tag default. Every `${IMAGE_TAG:-latest}` must be rewritten and
# none may survive; a changed overlay that no longer matches fails loudly here
# rather than shipping an unpinned bundle.
# shellcheck disable=SC2016 # a literal ${...} to match, not to expand
total="$(grep -c '\${IMAGE_TAG:-latest}' "$src_dir/docker-compose.images.yml" || true)"
((total > 0)) || die "docker-compose.images.yml has no \${IMAGE_TAG:-latest} to pin"
sed "s/\${IMAGE_TAG:-latest}/\${IMAGE_TAG:-$version}/g" "$src_dir/docker-compose.images.yml" >"$stage/docker-compose.images.yml"
pinned="$(grep -c "\${IMAGE_TAG:-$version}" "$stage/docker-compose.images.yml" || true)"
[[ "$pinned" == "$total" ]] || die "pinned $pinned of $total image tags"
! grep -q ':latest' "$stage/docker-compose.images.yml" || die "an unpinned :latest tag is left in docker-compose.images.yml"

printf '# Written by scripts/install/build-bundle.sh.\nGROOVENET_VERSION=%s\n' "$version" >"$stage/bundle.env"

for f in "${files[@]}"; do
  chmod 644 "$stage/$f"
  touch -t 197001010000 "$stage/$f"
done

mkdir -p "$out_dir"
out_dir="$(cd "$out_dir" && pwd)"
name="groovenet-compose-$version.tar.gz"
if tar --version 2>/dev/null | grep -q 'GNU tar'; then
  tar --sort=name --owner=0 --group=0 --numeric-owner --mtime=@0 -cf - -C "$stage" "${files[@]}"
else
  tar --uid 0 --gid 0 --uname root --gname root -cf - -C "$stage" "${files[@]}"
fi | gzip -n -9 >"$out_dir/$name"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$out_dir" && sha256sum "$name" >"$name.sha256")
else
  (cd "$out_dir" && shasum -a 256 "$name" >"$name.sha256")
fi
echo "wrote $out_dir/$name"
cat "$out_dir/$name.sha256"
