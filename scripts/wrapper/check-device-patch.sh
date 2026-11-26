#!/usr/bin/env bash
# Public source only: apply the fingerprint backport to exact tag 1.0.0, prove it
# reproduces the reviewed upstream file, then run that file's own unit tests.
# Never builds a wrapper, reads an APK or touches a session.
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
reviewed_blob=b9d09b7112602c85f10f677dd229b17f3a61be56
scratch="$(mktemp -d /tmp/groovenet-wrapper-device.XXXXXX)"
trap 'rm -rf "$scratch"' EXIT
git -c advice.detachedHead=false clone --quiet --depth 1 --branch 1.0.0 https://github.com/glomatico/wrapper-v2.git "$scratch/source"
[[ "$(git -C "$scratch/source" describe --tags --exact-match)" == 1.0.0 ]]
git -C "$scratch/source" apply "$repo/scripts/wrapper/compat/fresh-device-fingerprint.patch"
[[ "$(git -C "$scratch/source" hash-object src/device_info.rs)" == "$reviewed_blob" ]] ||
  { echo 'Patched device_info.rs differs from the reviewed upstream file' >&2; exit 1; }
mkdir "$scratch/harness"
cp "$scratch/source/src/device_info.rs" "$repo/scripts/wrapper/device_info_harness.rs" "$scratch/harness/"
rustc --edition 2021 --test -D warnings "$scratch/harness/device_info_harness.rs" -o "$scratch/harness/test"
"$scratch/harness/test"
