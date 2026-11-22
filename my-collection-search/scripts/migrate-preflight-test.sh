#!/usr/bin/env bash
# Exercise migrate-preflight.sh against a real Postgres. Point DATABASE_URL at
# an EMPTY, disposable database: every case drops and recreates the public
# schema. Needs only psql, so it runs in CI and in a bare postgres container.
#
# Used by `just migrate-preflight-test` and the migrate-test CI job.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to a disposable Postgres instance}"

here="$(cd "$(dirname "$0")" && pwd)"
preflight="$here/migrate-preflight.sh"
real_migrations="$here/../migrations"

fail() { echo "❌ $*" >&2; exit 1; }
sql() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tA "$@"; }
reset() { sql -q -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"; }
rows() { sql -c "SELECT COUNT(*) FROM pgmigrations"; }
expect_eq() { [ "$2" = "$3" ] || fail "$1: expected '$3', got '$2'"; }

create_pgmigrations() {
  sql -q -c "CREATE TABLE pgmigrations (id SERIAL PRIMARY KEY, name varchar(255) NOT NULL, run_on timestamp NOT NULL)"
}

scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

expected="$(find "$real_migrations" -maxdepth 1 -name '*.js' -exec basename {} .js \; | LC_ALL=C sort)"
[ -n "$expected" ] || fail "no migrations in $real_migrations"
expected_count="$(printf '%s\n' "$expected" | wc -l | tr -d ' ')"

echo "== backfill: tracks exists, pgmigrations empty =="
reset
sql -q -c "CREATE TABLE tracks (id int)"
create_pgmigrations
sh "$preflight"
expect_eq "row count" "$(rows)" "$expected_count"
expect_eq "names" "$(sql -c "SELECT name FROM pgmigrations ORDER BY name COLLATE \"C\"")" "$expected"
expect_eq "no glob row" "$(sql -c "SELECT COUNT(*) FROM pgmigrations WHERE name LIKE '%*%'")" "0"

echo "== second run is a no-op (rows present) =="
snapshot="SELECT string_agg(id::text || run_on::text, ',' ORDER BY id) FROM pgmigrations"
before="$(sql -c "$snapshot")"
sh "$preflight"
expect_eq "rows unchanged" "$(sql -c "$snapshot")" "$before"

echo "== no-op: pgmigrations already populated, migrations dir not even read =="
reset
sql -q -c "CREATE TABLE tracks (id int)"
create_pgmigrations
sql -q -c "INSERT INTO pgmigrations (name, run_on) VALUES ('1_existing', NOW())"
MIGRATIONS_DIR="$scratch/does-not-exist" sh "$preflight"
expect_eq "rows" "$(rows)" "1"

echo "== no-op: fresh database (no tracks table) =="
reset
sh "$preflight"
expect_eq "no pgmigrations created" "$(sql -c "SELECT to_regclass('public.pgmigrations') IS NULL")" "t"

echo "== fails loudly: migrations dir empty =="
reset
sql -q -c "CREATE TABLE tracks (id int)"
create_pgmigrations
mkdir "$scratch/empty"
if MIGRATIONS_DIR="$scratch/empty" sh "$preflight" 2>"$scratch/err"; then
  fail "expected non-zero exit for empty migrations dir"
fi
grep -q "no migration files" "$scratch/err" || fail "missing error message: $(cat "$scratch/err")"
expect_eq "rows" "$(rows)" "0"

echo "== fails loudly: migrations dir missing =="
if MIGRATIONS_DIR="$scratch/missing" sh "$preflight" 2>/dev/null; then
  fail "expected non-zero exit for missing migrations dir"
fi
expect_eq "rows" "$(rows)" "0"

echo "== default dir resolves relative to the script, not the cwd =="
(cd / && sh "$preflight")
expect_eq "row count" "$(rows)" "$expected_count"

echo "== default_library_settings backfill still runs =="
reset
sql -q -c "CREATE TABLE tracks (id int); CREATE TABLE default_library_settings (id int)"
create_pgmigrations
mkdir "$scratch/one"
touch "$scratch/one/1000_only.js"
MIGRATIONS_DIR="$scratch/one" sh "$preflight"
expect_eq "default library row" \
  "$(sql -c "SELECT COUNT(*) FROM pgmigrations WHERE name='1772300000001_add-default-library-settings'")" "1"
expect_eq "rows" "$(rows)" "2"

echo "✅ migrate-preflight test passed"
