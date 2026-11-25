#!/usr/bin/env bash
# End-to-end test of the installer (#1072): build the bundle from this checkout,
# run site/public/install.sh --non-interactive against published sha-/release
# images, run the clean-install checks (#1239) against the resulting stack, then
# run the installer again and prove the rerun changes nothing.
#
#   scripts/install/e2e.sh [TAG]
#
# TAG is an image tag: sha-<short> (a release candidate) or vX.Y.Z. Default: the
# newest vX.Y.Z git tag. Everything it creates is removed on exit.
#
# Environment:
#   DISCOGS_USER_TOKEN                Discogs token. Unset: the installer's import
#                                     and the data checks are skipped, loudly.
#   CLEAN_INSTALL_DISCOGS_USERNAME    public user to import (default dj_shadow)
#   INSTALL_TEST_DEFAULTS=1           use the installer's own defaults (project
#                                     groovenet, port 3000, /srv/groovenet or
#                                     ~/groovenet) instead of an isolated project,
#                                     directory and port. CI does; a laptop with a
#                                     real install should not.
#   CLEAN_INSTALL_LOG_DIR             keep compose logs here
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
installer="$repo_root/site/public/install.sh"
# shellcheck disable=SC2034 # read by scripts/lib/clean-install-checks.sh
registry="${REGISTRY:-ghcr.io/public-vinyl-radio}"
# shellcheck disable=SC2034
health_timeout="${CLEAN_INSTALL_HEALTH_TIMEOUT:-300}"
# shellcheck disable=SC2034
import_timeout="${CLEAN_INSTALL_IMPORT_TIMEOUT:-300}"
# shellcheck disable=SC2034
discogs_user="${CLEAN_INSTALL_DISCOGS_USERNAME:-dj_shadow}"

step() { printf '\n==> %s\n' "$*"; }
ok() { printf '    ok: %s\n' "$*"; }
die() {
  printf '\nFAIL: %s\n' "$*" >&2
  exit 1
}

for tool in docker curl python3 tar; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool is required"
done
docker info >/dev/null 2>&1 || die "the Docker daemon is not reachable"

# shellcheck disable=SC2034
tag="${1:-}"
if [[ -z "$tag" ]]; then
  tag="$(git -C "$repo_root" tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -n 1)"
  [[ -n "$tag" ]] || die "no release tag found; pass one: install/e2e.sh sha-1a99dbd"
fi

# A host with these set must not leak into the stack under test.
# This smoke test must never join or modify a real tailnet.
unset TS_AUTHKEY
unset COMPOSE_FILE COMPOSE_PROFILES COMPOSE_PROJECT_NAME COMPOSE_ENV_FILES IMAGE_TAG REGISTRY
unset PROD_DB_DATA_VOLUME APP_AUDIO_MOUNT WORKER_AUDIO_MOUNT SET_RECORDINGS_MOUNT POSTGRES_USER POSTGRES_DB

# shellcheck disable=SC2034
work="$(mktemp -d "${TMPDIR:-/tmp}/groovenet-install-e2e.XXXXXX")"
log_dir="${CLEAN_INSTALL_LOG_DIR:-$work/logs}"
mkdir -p "$log_dir"

install_args=(--non-interactive --bundle "$work/bundle/groovenet-compose-$tag.tar.gz" --image-tag "$tag")
if [[ "${INSTALL_TEST_DEFAULTS:-}" == "1" ]]; then
  # Where the installer puts things itself. Read back from the marker it writes.
  dir=""
  project="groovenet"
  port=3000
else
  project="groovenet-install-$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
  [[ "$project" != "dj-playlist" ]] || die "refusing to use the production project name"
  port="$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')"
  dir="$work/install"
  install_args+=(--dir "$dir" --project-name "$project" --port "$port")
fi

import_token="${DISCOGS_USER_TOKEN:-}"
if [[ -n "$import_token" ]]; then
  export DISCOGS_USER_TOKEN DISCOGS_USERNAME="$discogs_user"
  install_args+=(--import)
else
  unset DISCOGS_USER_TOKEN DISCOGS_USERNAME
fi

compose() { (cd "$dir" && docker compose "$@"); }

status=1
cleaned=0
cleanup() {
  local rc=$?
  [[ $cleaned -eq 0 ]] || return 0
  cleaned=1
  trap - EXIT INT TERM
  set +e
  if [[ -n "$dir" && -f "$dir/.env" ]]; then
    compose logs --no-color --timestamps >"$log_dir/compose.log" 2>&1
    compose ps -a >"$log_dir/ps.txt" 2>&1
    step "Tearing down $project"
    compose down -v --remove-orphans >/dev/null 2>&1
    if [[ "${INSTALL_TEST_DEFAULTS:-}" == "1" ]]; then
      rm -rf "$dir" 2>/dev/null || sudo rm -rf "$dir"
    fi
  fi
  if [[ $status -ne 0 || $rc -ne 0 ]]; then
    echo "Logs kept in: $log_dir" >&2
  else
    [[ -n "${CLEAN_INSTALL_LOG_DIR:-}" ]] || rm -rf "$work"
  fi
  exit $((status != 0 ? status : rc))
}
trap cleanup EXIT
trap 'status=130; exit 130' INT
trap 'status=143; exit 143' TERM

step "Building the install bundle from this checkout ($tag)"
"$repo_root/scripts/install/build-bundle.sh" "$tag" "$work/bundle" >/dev/null
ok "$work/bundle/groovenet-compose-$tag.tar.gz"

# In defaults mode the installer chooses the directory; find it afterwards by
# the one place it can be.
find_default_dir() {
  local d
  for d in /srv/groovenet "$HOME/groovenet"; do
    if [[ -f "$d/.groovenet-install" ]]; then
      echo "$d"
      return 0
    fi
  done
  return 1
}

step "Installer, first run"
install_log="$work/install-1.log"
"$installer" "${install_args[@]}" 2>&1 | tee "$install_log" || die "the installer failed"
[[ -n "$dir" ]] || dir="$(find_default_dir)" || die "the installer left no install directory"
# shellcheck disable=SC2034 # read by scripts/lib/clean-install-checks.sh
base="http://127.0.0.1:$port"

[[ "$(stat -c '%a' "$dir/.env" 2>/dev/null || stat -f '%Lp' "$dir/.env")" == "600" ]] || die ".env is not mode 600"
ok ".env is mode 600"
! grep -Fq "$import_token" "$install_log" || [[ -z "$import_token" ]] || die "the installer printed the Discogs token"
! grep -Eq 'CHANGE_ME' "$dir/.env" || die ".env still has a placeholder secret"
ok "no placeholder secrets, nothing secret printed"

# shellcheck disable=SC1091
source "$repo_root/scripts/lib/clean-install-checks.sh"
check_health
check_services "app db redis"
check_migrations
if [[ -n "$import_token" ]]; then
  check_imported_data
else
  echo "    SKIPPED: DISCOGS_USER_TOKEN is not set; the installer's import and the data checks did not run." >&2
fi

# --- Rerun: a no-op -----------------------------------------------------------
snapshot() {
  local s
  for s in app db redis; do
    docker inspect -f '{{.Name}} {{.Id}} {{.State.StartedAt}}' "$(compose ps -q "$s")"
  done
  cksum <"$dir/.env"
  cat "$dir"/docker-compose*.yml | cksum
}
step "Installer, second run (must change nothing)"
snapshot >"$work/before.txt"
second_args=("${install_args[@]}")
second_log="$work/install-2.log"
"$installer" "${second_args[@]/--import/--no-import}" 2>&1 | tee "$second_log" || die "the second installer run failed"
grep -q "Nothing changed" "$second_log" || die "the second run did not report 'Nothing changed'"
snapshot >"$work/after.txt"
diff -u "$work/before.txt" "$work/after.txt" || die "the second run changed containers or files"
ok "same containers, same start times, same .env and compose files"
check_health

printf '\nPASS: the installer installs from %s, passes the clean-install checks, and a rerun is a no-op\n' "$tag"
status=0
