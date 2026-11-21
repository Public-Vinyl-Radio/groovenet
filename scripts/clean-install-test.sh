#!/usr/bin/env bash
# Clean-install smoke test (#1239): the path a new adopter takes, from the
# published images to the first Discogs import.
#
#   scripts/clean-install-test.sh [TAG]
#
# TAG is a release tag (v0.3.19) or a release-candidate image (sha-1a99dbd).
# Default: the latest vX.Y.Z release tag.
#
# It runs the README quick start in a throwaway Compose project of its own:
# .env.example plus only the values a user must set, then
#   COMPOSE_FILE=docker-compose.yml:docker-compose.images.yml:docker-compose.local.yml
#   docker compose up -d
# and checks health, migrations, the first Discogs import and the album/track
# API. Everything it creates is removed on exit, success or not. It never
# touches the `dj-playlist` project or any other project.
#
# Environment:
#   DISCOGS_USER_TOKEN                   Discogs token. Unset: the import step is
#                                        skipped (loudly) and the rest still run.
#   CLEAN_INSTALL_DISCOGS_USERNAME       Public Discogs user to import
#                                        (default: dj_shadow, a single release).
#   CLEAN_INSTALL_LOG_DIR                Keep compose logs here (default: a temp dir).
#   CLEAN_INSTALL_HEALTH_TIMEOUT         Seconds to wait for the app (default 300).
#   CLEAN_INSTALL_IMPORT_TIMEOUT         Seconds the import may take (default 300).
#   CLEAN_INSTALL_KEEP=1                 On success, leave the stack running to look
#                                        at in a browser, and print the URL and the
#                                        command that removes it. A failure always
#                                        tears down.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
registry="${REGISTRY:-ghcr.io/public-vinyl-radio}"
discogs_user="${CLEAN_INSTALL_DISCOGS_USERNAME:-dj_shadow}"
health_timeout="${CLEAN_INSTALL_HEALTH_TIMEOUT:-300}"
import_timeout="${CLEAN_INSTALL_IMPORT_TIMEOUT:-300}"

step() { printf '\n==> %s\n' "$*"; }
ok() { printf '    ok: %s\n' "$*"; }
die() {
  printf '\nFAIL: %s\n' "$*" >&2
  exit 1
}

for tool in docker curl python3 openssl; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool is required"
done
docker info >/dev/null 2>&1 || die "the Docker daemon is not reachable"

# --- Image tag ---------------------------------------------------------------
tag="${1:-}"
if [[ -z "$tag" ]]; then
  tag="$(git -C "$repo_root" tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -n 1)"
  if [[ -z "$tag" ]] && command -v gh >/dev/null 2>&1; then
    tag="$(gh release list --repo Public-Vinyl-Radio/groovenet --limit 50 --json tagName --jq '[.[].tagName | select(test("^v[0-9]+\\.[0-9]+\\.[0-9]+$"))][0]' 2>/dev/null || true)"
  fi
  [[ -n "$tag" ]] || die "no release tag found; pass one explicitly: clean-install-test.sh v0.3.19"
fi

# --- Isolation ---------------------------------------------------------------
# A host that has these set must not leak into the test project.
unset COMPOSE_PROFILES COMPOSE_PROJECT_NAME COMPOSE_ENV_FILES PROD_DB_DATA_VOLUME
unset APP_AUDIO_MOUNT WORKER_AUDIO_MOUNT SET_RECORDINGS_MOUNT POSTGRES_USER POSTGRES_DB

project="groovenet-clean-$(openssl rand -hex 4)"
[[ "$project" != "dj-playlist" ]] || die "refusing to use the production project name"
port="$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')"
work="$(mktemp -d "${TMPDIR:-/tmp}/groovenet-clean-install.XXXXXX")"
log_dir="${CLEAN_INSTALL_LOG_DIR:-$work/logs}"
mkdir -p "$log_dir"

export COMPOSE_FILE="docker-compose.yml:docker-compose.images.yml:docker-compose.local.yml"
# The published Groovenet images are amd64 only. On an ARM host (Apple silicon)
# run just those under emulation; db and redis stay native. This is a host
# accommodation, not part of the documented install.
if [[ "$(uname -m)" =~ ^(arm64|aarch64)$ ]]; then
  printf 'services:\n  app:\n    platform: linux/amd64\n  migrate:\n    platform: linux/amd64\n' >"$work/platform.yml"
  COMPOSE_FILE="$COMPOSE_FILE:$work/platform.yml"
fi
export IMAGE_TAG="$tag"
export REGISTRY="$registry"
compose() {
  docker compose --project-directory "$repo_root" --env-file "$work/.env" -p "$project" "$@"
}

base=""
status=1
cleaned=0
cleanup() {
  local rc=$?
  [[ $cleaned -eq 0 ]] || return 0
  cleaned=1
  trap - EXIT INT TERM
  set +e
  if [[ -f "$work/.env" ]]; then
    compose logs --no-color --timestamps >"$log_dir/compose.log" 2>&1
    for svc in $(compose ps -a --services 2>/dev/null); do
      compose logs --no-color --timestamps "$svc" >"$log_dir/$svc.log" 2>&1
    done
    compose ps -a >"$log_dir/ps.txt" 2>&1
    if [[ "${CLEAN_INSTALL_KEEP:-}" == "1" && $status -eq 0 && $rc -eq 0 ]]; then
      step "Keeping $project running (CLEAN_INSTALL_KEEP=1)"
      echo "    Open:   $base"
      echo "    Remove: COMPOSE_FILE=$COMPOSE_FILE docker compose --project-directory $repo_root --env-file $work/.env -p $project down -v --remove-orphans && rm -rf $work"
      exit 0
    fi
    step "Tearing down $project"
    compose down -v --remove-orphans >/dev/null 2>&1
  fi
  if [[ $status -ne 0 || $rc -ne 0 ]]; then
    echo "Compose logs kept in: $log_dir" >&2
  else
    [[ -n "${CLEAN_INSTALL_LOG_DIR:-}" ]] || rm -rf "$work"
  fi
  exit $((status != 0 ? status : rc))
}
trap cleanup EXIT
trap 'status=130; exit 130' INT
trap 'status=143; exit 143' TERM

# --- .env: what a new user does ----------------------------------------------
step "Preparing .env from .env.example (project $project, port $port, images $tag)"
cp "$repo_root/.env.example" "$work/.env"
set_env() {
  # Replace the one assignment, failing if .env.example no longer has it.
  local key="$1" value="$2"
  grep -q "^${key}=" "$work/.env" || die ".env.example has no ${key}= line"
  python3 -I - "$work/.env" "$key" "$value" <<'PY'
import sys
path, key, value = sys.argv[1:4]
lines = open(path).read().split("\n")
out = [f"{key}={value}" if l.startswith(key + "=") else l for l in lines]
open(path, "w").write("\n".join(out))
PY
}
set_env COMPOSE_PROJECT_NAME "$project"
# .env.example has no APP_PORT (docker-compose.local.yml defaults it), so append.
printf '\nAPP_PORT=%s\n' "$port" >>"$work/.env"
set_env POSTGRES_PASSWORD "$(openssl rand -hex 24)"
discogs_token="${DISCOGS_USER_TOKEN:-}"
if [[ -n "$discogs_token" ]]; then
  set_env DISCOGS_USER_TOKEN "$discogs_token"
  set_env DISCOGS_USERNAME "$discogs_user"
fi
# Never print the token or password; show what else differs from the template.
ok "only POSTGRES_PASSWORD, COMPOSE_PROJECT_NAME, APP_PORT${discogs_token:+, DISCOGS_*} changed"

base="http://127.0.0.1:$port"

# --- Up ----------------------------------------------------------------------
step "docker compose up -d (documented quick-start path)"
compose up -d --quiet-pull || die "docker compose up failed (a failing migrate keeps the app down)"

step "Waiting for $base/api/health (up to ${health_timeout}s)"
deadline=$((SECONDS + health_timeout))
until curl -fsS --max-time 5 "$base/api/health" >/dev/null 2>&1; do
  ((SECONDS < deadline)) || die "the app did not become healthy within ${health_timeout}s"
  sleep 3
done
ok "/api/health answers"

step "Core services only"
running="$(compose ps --services --status running | sort | tr '\n' ' ')"
[[ "$running" == "app db redis " ]] || die "expected exactly app, db and redis running, got: ${running:-none}"
ok "running: $running"
migrate_state="$(compose ps -a --format '{{.Service}} {{.State}} {{.ExitCode}}' migrate)"
[[ "$migrate_state" == "migrate exited 0" ]] || die "migrate should have run and exited 0, got: ${migrate_state:-no migrate container (is it behind a profile?)}"
ok "migrate exited 0"

# --- Migrations --------------------------------------------------------------
# The latest migration is the newest file in the image that ran them, so a
# release tag older than this checkout is judged against its own migrations.
step "Migrations applied"
latest="$(docker run --rm --platform linux/amd64 --entrypoint sh "$registry/webapp-migrate:$tag" -c 'ls /repo/my-collection-search/migrations' | grep '\.js$' | sort | tail -n 1)"
[[ -n "$latest" ]] || die "could not list migrations in $registry/webapp-migrate:$tag"
latest="${latest%.js}"
repo_latest="$(find "$repo_root/my-collection-search/migrations" -name '*.js' -exec basename {} .js \; | sort | tail -n 1)"
# shellcheck disable=SC2016 # $POSTGRES_* expand inside the db container, on purpose
psql_db() { compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA' <<<"$1"; }
applied="$(psql_db "SELECT count(*) FROM pgmigrations WHERE name = '$latest'" | tr -d '[:space:]')"
[[ "$applied" == "1" ]] || die "pgmigrations has no row for the latest migration $latest"
ok "pgmigrations contains $latest"
[[ "$latest" == "$repo_latest" ]] || echo "    note: $tag's latest migration is $latest; this checkout's is $repo_latest"

# --- Discogs import ----------------------------------------------------------
if [[ -z "$discogs_token" ]]; then
  step "Discogs import"
  echo "    SKIPPED: DISCOGS_USER_TOKEN is not set, so nothing was imported." >&2
  echo "    Everything up to here passed; the import, album/track checks did not run." >&2
  status=0
  exit 0
fi

step "Importing the Discogs collection of $discogs_user"
import_out="$work/import.out"
curl -fsS --max-time "$import_timeout" -N "$base/api/discogs?username=$discogs_user" >"$import_out" \
  || die "GET /api/discogs failed (output: $(tail -c 500 "$import_out" 2>/dev/null))"
grep -q "Sync complete for $discogs_user" "$import_out" || die "the import did not report completion; tail: $(tail -c 800 "$import_out")"
if grep -Eq "❌|Album ingest error|failed to download" "$import_out"; then
  die "the import reported errors: $(grep -E '❌|Album ingest error|Error for release|failed to download' "$import_out" | head -5)"
fi
grep -q "Auto-ingest complete" "$import_out" || die "auto-ingest did not complete; tail: $(tail -c 800 "$import_out")"
ok "$(grep -E 'Sync complete for' "$import_out" | tail -n 1)"

step "Albums and tracks landed in Postgres"
albums="$(psql_db "SELECT count(*) FROM albums" | tr -d '[:space:]')"
tracks="$(psql_db "SELECT count(*) FROM tracks" | tr -d '[:space:]')"
((albums >= 1)) || die "no albums in Postgres after the import"
((tracks >= 1)) || die "no tracks in Postgres after the import"
ok "$albums albums, $tracks tracks"

step "The app's API returns them"
api_albums="$(curl -fsS --max-time 30 "$base/api/albums?limit=5")" || die "GET /api/albums failed"
api_tracks="$(curl -fsS --max-time 30 "$base/api/tracks/search?limit=5")" || die "GET /api/tracks/search failed"
check_api() {
  python3 -I - "$api_albums" "$api_tracks" <<'PY'
import json, sys

def rows(body, *keys):
    data = json.loads(body)
    for key in keys:
        if isinstance(data, dict) and isinstance(data.get(key), list):
            return data[key]
    raise SystemExit(f"no list under any of {keys} in {str(data)[:200]}")

albums = rows(sys.argv[1], "albums", "results", "hits")
tracks = rows(sys.argv[2], "tracks", "results", "hits")
if not albums:
    raise SystemExit("GET /api/albums returned no albums")
if not tracks:
    raise SystemExit("GET /api/tracks/search returned no tracks")
print(f"    ok: /api/albums returned {len(albums)}, /api/tracks/search returned {len(tracks)}")
PY
}
check_api || die "the album/track API did not return the imported data"

printf '\nPASS: clean install on %s works from the published images to the first Discogs import\n' "$tag"
status=0
