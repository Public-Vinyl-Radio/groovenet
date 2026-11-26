#!/usr/bin/env bash
# Owner operation only. Never execute this with an APK during automated checks.
set -euo pipefail
[[ $# == 1 ]] || { echo 'Usage: just wrapper-build <path-to-apk-or-apkm>' >&2; exit 2; }
package="$(realpath "$1")"
[[ -f "$package" ]] || { echo 'Package not found' >&2; exit 1; }
repo="$(cd "$(dirname "$0")/../.." && pwd)"
case "$package" in "$repo"/*) echo 'Keep the APK/APKM outside the repository' >&2; exit 1 ;; esac
# mktemp stays outside the checkout, including when TMPDIR is customized.
scratch="$(mktemp -d /tmp/groovenet-wrapper-1.0.0.XXXXXX)"
trap 'rm -rf "$scratch"' EXIT
git clone --quiet --depth 1 --branch 1.0.0 https://github.com/glomatico/wrapper-v2.git "$scratch/source"
[[ "$(git -C "$scratch/source" describe --tags --exact-match)" == 1.0.0 ]]
export WRAPPER_IMAGE=wrapper-v2:1.0.0-local-amd64
"$scratch/source/tools/build-docker.sh" "$package" --arch x86_64
