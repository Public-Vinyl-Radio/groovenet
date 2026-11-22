#!/usr/bin/env bash
# Checks shared by scripts/clean-install-test.sh (#1239, the manual quick start)
# and scripts/install/e2e.sh (#1072, the installer): a running stack is healthy,
# runs only what it should, has migrated, and imports and serves a Discogs
# collection. Source it; it defines functions only.
#
# The caller provides before calling any check:
#   compose        a function running `docker compose` against the stack under test
#   base           the app's URL, e.g. http://127.0.0.1:3000
#   tag            the image tag under test
#   registry       image registry prefix (ghcr.io/public-vinyl-radio)
#   repo_root      this checkout (to compare the newest migration)
#   work           a scratch directory
#   die, step, ok  reporting helpers (die exits)
# and optionally health_timeout, import_timeout, discogs_user.

# shellcheck disable=SC2154 # the variables above come from the sourcing script

check_health() {
  step "Waiting for $base/api/health (up to ${health_timeout:-300}s)"
  local deadline=$((SECONDS + ${health_timeout:-300}))
  until curl -fsS --max-time 5 "$base/api/health" >/dev/null 2>&1; do
    ((SECONDS < deadline)) || die "the app did not become healthy within ${health_timeout:-300}s"
    sleep 3
  done
  ok "/api/health answers"
}

# check_services "app db redis": exactly these run, and migrate and volume-perms exited 0.
check_services() {
  local expected="$1"
  step "Only the expected services run"
  local running
  running="$(compose ps --services --status running | sort | tr '\n' ' ')"
  [[ "$running" == "$expected " ]] || die "expected exactly ${expected// /, } running, got: ${running:-none}"
  ok "running: $running"
  local migrate_state
  migrate_state="$(compose ps -a --format '{{.Service}} {{.State}} {{.ExitCode}}' migrate)"
  [[ "$migrate_state" == "migrate exited 0" ]] || die "migrate should have run and exited 0, got: ${migrate_state:-no migrate container (is it behind a profile?)}"
  ok "migrate exited 0"
  local perms_state
  perms_state="$(compose ps -a --format '{{.Service}} {{.State}} {{.ExitCode}}' volume-perms)"
  [[ "$perms_state" == "volume-perms exited 0" ]] || die "volume-perms should have run and exited 0, got: ${perms_state:-no volume-perms container}"
  ok "volume-perms exited 0"
}

# shellcheck disable=SC2016 # $POSTGRES_* expand inside the db container, on purpose
psql_db() { compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA' <<<"$1"; }

# The latest migration is the newest file in the image that ran them, so a
# release tag older than this checkout is judged against its own migrations.
check_migrations() {
  step "Migrations applied"
  local latest repo_latest applied
  latest="$(docker run --rm --platform linux/amd64 --entrypoint sh "$registry/webapp-migrate:$tag" -c 'ls /repo/my-collection-search/migrations' | grep '\.js$' | sort | tail -n 1)"
  [[ -n "$latest" ]] || die "could not list migrations in $registry/webapp-migrate:$tag"
  latest="${latest%.js}"
  repo_latest="$(find "$repo_root/my-collection-search/migrations" -name '*.js' -exec basename {} .js \; | sort | tail -n 1)"
  applied="$(psql_db "SELECT count(*) FROM pgmigrations WHERE name = '$latest'" | tr -d '[:space:]')"
  [[ "$applied" == "1" ]] || die "pgmigrations has no row for the latest migration $latest"
  ok "pgmigrations contains $latest"
  [[ "$latest" == "$repo_latest" ]] || echo "    note: $tag's latest migration is $latest; this checkout's is $repo_latest"
}

# import_discogs TOKEN-PRESENT: the streamed sync of ${discogs_user}.
run_import() {
  step "Importing the Discogs collection of $discogs_user"
  local import_out="$work/import.out"
  curl -fsS --max-time "${import_timeout:-300}" -N "$base/api/discogs?username=$discogs_user" >"$import_out" \
    || die "GET /api/discogs failed (output: $(tail -c 500 "$import_out" 2>/dev/null))"
  grep -q "Sync complete for $discogs_user" "$import_out" || die "the import did not report completion; tail: $(tail -c 800 "$import_out")"
  if grep -Eq "❌|Album ingest error|failed to download" "$import_out"; then
    die "the import reported errors: $(grep -E '❌|Album ingest error|Error for release|failed to download' "$import_out" | head -5)"
  fi
  grep -q "Auto-ingest complete" "$import_out" || die "auto-ingest did not complete; tail: $(tail -c 800 "$import_out")"
  ok "$(grep -E 'Sync complete for' "$import_out" | tail -n 1)"
}

# What the import leaves behind: rows in Postgres and the same through the API.
check_imported_data() {
  step "Albums and tracks landed in Postgres"
  local albums tracks
  albums="$(psql_db "SELECT count(*) FROM albums" | tr -d '[:space:]')"
  tracks="$(psql_db "SELECT count(*) FROM tracks" | tr -d '[:space:]')"
  ((albums >= 1)) || die "no albums in Postgres after the import"
  ((tracks >= 1)) || die "no tracks in Postgres after the import"
  ok "$albums albums, $tracks tracks"

  step "The app's API returns them"
  local api_albums api_tracks
  api_albums="$(curl -fsS --max-time 30 "$base/api/albums?limit=5")" || die "GET /api/albums failed"
  api_tracks="$(curl -fsS --max-time 30 "$base/api/tracks/search?limit=5")" || die "GET /api/tracks/search failed"
  python3 -I - "$api_albums" "$api_tracks" <<'PY' || die "the album/track API did not return the imported data"
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
