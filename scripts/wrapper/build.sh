#!/usr/bin/env bash
# Owner operation only. Never execute this with an APK during automated checks.
set -euo pipefail
usage() { echo 'Usage: just wrapper-build <path-to-apk-or-apkm> [--arch x86_64|aarch64]' >&2; exit 2; }
[[ $# == 1 || ( $# == 3 && "$2" == --arch ) ]] || usage
arch="${3-$(uname -m)}"
case "$arch" in
  x86_64) image_arch=amd64 ;;
  arm64|aarch64) arch=aarch64; image_arch=arm64 ;;
  *) echo 'Unsupported architecture; use x86_64 or aarch64' >&2; exit 2 ;;
esac
package="$(realpath "$1")"
[[ -f "$package" ]] || { echo 'Package not found' >&2; exit 1; }
repo="$(cd "$(dirname "$0")/../.." && pwd)"
case "$package" in "$repo"/*) echo 'Keep the APK/APKM outside the repository' >&2; exit 1 ;; esac
# mktemp stays outside the checkout, including when TMPDIR is customized.
scratch="$(mktemp -d /tmp/groovenet-wrapper-1.0.0.XXXXXX)"
trap 'rm -rf "$scratch"' EXIT
git clone --quiet --depth 1 --branch 1.0.0 https://github.com/glomatico/wrapper-v2.git "$scratch/source"
[[ "$(git -C "$scratch/source" describe --tags --exact-match)" == 1.0.0 ]]
compat="$repo/scripts/wrapper/compat"
# Fresh-login device fingerprint (upstream PR #24), both architectures. Only
# newly generated identities change; stored ones and overrides are preserved.
git -C "$scratch/source" apply --check "$compat/fresh-device-fingerprint.patch"
git -C "$scratch/source" apply "$compat/fresh-device-fingerprint.patch"
if [[ "$arch" == aarch64 ]]; then
  # Source workaround for GNU-only vDSO mappings on newer ARM64 Linux kernels.
  # Keep the pinned Android runtime and Apple libraries unchanged.
  git -C "$scratch/source" apply --check "$compat/explicit-symbol-scopes.patch"
  git -C "$scratch/source" apply "$compat/explicit-symbol-scopes.patch"
  cp "$compat/symbol_lookup.hpp" "$scratch/source/native/symbol_lookup.hpp"
fi
export WRAPPER_IMAGE="wrapper-v2:1.0.0-local-$image_arch"
"$scratch/source/tools/build-docker.sh" "$package" --arch "$arch"
