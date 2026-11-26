#!/usr/bin/env bash
# Seed-restore behaviour of setup.sh (#1305) against a stub `docker`, `psql` and
# `pg_restore`: a failed schema reset, restore or truncated dump must stop setup
# before migrations, service start, asset restore and the success banner; a good
# restore must carry on through all of them; --reseed must be confirmed and
# restore into a non-empty database. Needs no Docker, Caddy or 1Password. The
# real-Postgres check lives in seed_restore_integration_test.sh.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_DIR"' EXIT
export WORKTREE_STATE_DIR="$TEST_DIR/state" SEED_ROOT="$TEST_DIR/seeds" SEED_LATEST_DIR="$TEST_DIR/seed"
export CADDY_WORKTREE_DIR="$TEST_DIR/caddy-dir" WORKTREE_LOCK_DIR="$TEST_DIR/lock"
export APP_DIR="$TEST_DIR/app" PATH="$TEST_DIR/bin:$PATH" TEST_DIR
mkdir -p "$WORKTREE_STATE_DIR" "$SEED_ROOT" "$CADDY_WORKTREE_DIR" "$TEST_DIR/bin" "$APP_DIR/scripts" "$SEED_LATEST_DIR/app"

# Fake docker: `exec -T db sh -c SCRIPT` runs SCRIPT locally under dash-like `sh`
# so the real restore script (set -eu, no pipeline) is what gets exercised.
cat >"$TEST_DIR/bin/docker" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$TEST_DIR/calls"
args=("$@")
last="${args[${#args[@]}-1]}"
case " $* " in
  *" config --services "*) printf 'app\ndb\nredis\nmigrate\n'; exit 0 ;;
  *" exec -T db sh "*)
    case "$last" in
      *pg_isready*) exit 0 ;;
      *information_schema*) echo "${DB_TABLES:-0}"; exit 0 ;;
      *pg_restore*) exec sh -c "$last" ;;
    esac ;;
  *" ps -q app "*) echo fakecontainer; exit 0 ;;
  *" run "*) echo MIGRATE >>"$TEST_DIR/events" ;;
  *" up -d --remove-orphans "*db\ redis*) : ;;
  *" up -d --remove-orphans"*) echo SERVICES >>"$TEST_DIR/events" ;;
  *" stop "*) echo STOP >>"$TEST_DIR/events" ;;
esac
exit 0
STUB
cat >"$TEST_DIR/bin/psql" <<'STUB'
#!/usr/bin/env bash
echo SCHEMA_RESET >>"$TEST_DIR/events"
[[ "${FAIL:-}" != schema ]] || { echo "psql: ERROR: stub schema failure" >&2; exit 1; }
exit 0
STUB
cat >"$TEST_DIR/bin/pg_restore" <<'STUB'
#!/usr/bin/env bash
echo RESTORE >>"$TEST_DIR/events"
body="$(cat)"
[[ "${FAIL:-}" != restore ]] || { echo "pg_restore: error: stub restore failure" >&2; exit 1; }
[[ "$body" == *END ]] || { echo "pg_restore: error: could not read from input file: end of file" >&2; exit 1; }
exit 0
STUB
printf '#!/usr/bin/env bash\nexit 1\n' >"$TEST_DIR/bin/op"
printf '#!/usr/bin/env bash\nexit 0\n' >"$TEST_DIR/bin/caddy"
cat >"$APP_DIR/scripts/restore-restic-assets.sh" <<'STUB'
#!/usr/bin/env bash
echo ASSETS >>"$TEST_DIR/events"
STUB
chmod +x "$TEST_DIR"/bin/* "$APP_DIR/scripts/restore-restic-assets.sh"

# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"
cat >"$(worktree_env_file)" <<EOF_ENV
COMPOSE_PROJECT_NAME=$(compose_project_name "$REPO_ROOT" "$CURRENT_BRANCH")
WORKTREE_HOST=test
APP_PORT=34567
COMPOSE_PROFILES=
POSTGRES_PASSWORD=sekrit-pw-for-test
EOF_ENV

failures=0
check() {
  if "${@:2}"; then echo "ok - $1"; else echo "FAIL - $1"; failures=$((failures + 1)); fi
}
saw() { grep -qx "$1" "$TEST_DIR/events"; }
never() { ! grep -qx "$1" "$TEST_DIR/events"; }
log_has() { grep -q -- "$1" "$TEST_DIR/out"; }
log_lacks() { ! grep -q -- "$1" "$TEST_DIR/out"; }

# run_setup NAME [setup args...]: env FAIL / DB_TABLES come from the caller.
run_setup() {
  : >"$TEST_DIR/events"
  : >"$TEST_DIR/calls"
  rc=0
  "$SCRIPT_DIR/setup.sh" "${@:2}" >"$TEST_DIR/out" 2>&1 </dev/null || rc=$?
}
stopped_before_everything() {
  [[ "$rc" -ne 0 ]] && never MIGRATE && never SERVICES && never ASSETS && log_lacks "Worktree ready"
}

good_dump() { printf 'PGDMP-body-END' >"$SEED_LATEST_DIR/db.dump"; }

good_dump
FAIL= DB_TABLES=0 run_setup good
check "good restore exits 0" test "$rc" -eq 0
check "good restore resets schema then restores" bash -c "grep -n . '$TEST_DIR/events' | head -2 | tr '\n' ' ' | grep -q 'SCHEMA_RESET.*RESTORE'"
check "good restore runs migrations" saw MIGRATE
check "good restore starts the remaining services" saw SERVICES
check "good restore restores assets" saw ASSETS
check "good restore prints the success banner" log_has "Worktree ready"

FAIL=schema DB_TABLES=0 run_setup schema
check "schema-reset failure stops setup before everything" stopped_before_everything
check "schema-reset failure never reaches pg_restore" never RESTORE
check "schema-reset failure prints recovery steps" log_has "just worktree-up --reseed"

FAIL=restore DB_TABLES=0 run_setup restore
check "restore failure stops setup before everything" stopped_before_everything
check "restore failure prints recovery steps" log_has "just worktree-up --reseed"

printf 'PGDMP-body-trunc' >"$SEED_LATEST_DIR/db.dump"
FAIL= DB_TABLES=0 run_setup truncated
check "truncated dump stops setup before everything" stopped_before_everything
check "truncated dump reports the failure" log_has "end of file"

: >"$SEED_LATEST_DIR/db.dump"
FAIL= DB_TABLES=0 run_setup empty
check "empty dump stops setup before everything" stopped_before_everything
check "empty dump never touches the database" never SCHEMA_RESET

printf 'not-a-dump' >"$SEED_LATEST_DIR/db.dump"
FAIL= DB_TABLES=0 run_setup wrongformat
check "non-archive dump stops setup before everything" stopped_before_everything
check "non-archive dump never touches the database" never SCHEMA_RESET

good_dump
FAIL=restore DB_TABLES=0 run_setup secrets
check "password never appears in setup output" log_lacks "sekrit-pw-for-test"

# Existing data: the restore is skipped unless --reseed asks for it.
FAIL= DB_TABLES=7 run_setup nonempty
check "non-empty database skips the restore" never RESTORE
check "non-empty database points at --reseed" log_has "just worktree-up --reseed"
check "non-empty database still migrates" saw MIGRATE

FAIL= DB_TABLES=7 run_setup reseed-noyes --reseed
check "--reseed without a tty or --yes refuses" test "$rc" -ne 0
check "--reseed refusal leaves the database alone" never SCHEMA_RESET

FAIL= DB_TABLES=7 run_setup reseed --reseed --yes
check "--reseed --yes exits 0" test "$rc" -eq 0
check "--reseed stops the app services first" saw STOP
check "--reseed keeps db and redis running" bash -c "! grep -E 'stop .*( db| redis)( |$)' '$TEST_DIR/calls'"
check "--reseed restores into the non-empty database" saw RESTORE
check "--reseed then migrates and restores assets" bash -c "grep -qx MIGRATE '$TEST_DIR/events' && grep -qx ASSETS '$TEST_DIR/events'"

FAIL=restore DB_TABLES=7 run_setup reseed-fail --reseed --yes
check "--reseed restore failure stops setup before everything" stopped_before_everything

FAIL= DB_TABLES=7 run_setup reseed-noseed --reseed --yes --no-seed
check "--reseed with --no-seed is rejected" test "$rc" -ne 0

echo
if ((failures == 0)); then echo "All setup restore tests passed."; exit 0; fi
echo "$failures setup restore test(s) failed."
exit 1
