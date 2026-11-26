#!/usr/bin/env bash
# Real-Postgres check of the seed restore path (#1305). Gated: RUN_SEED_RESTORE_TESTS=1.
#
# Starts a throwaway container from the db service's own image with the same 64 MB
# /tmp tmpfs, builds a synthetic database bigger than that, dumps it with
# `pg_dump -Fc` both to a file (seekable, has data offsets) and to a pipe (no
# offsets: how create-golden-seed.sh and create-prod-seed.sh write db.dump), then
# restores each through the same script setup.sh runs. Also proves the old
# staging-in-/tmp approach fails at this size, and that a truncated dump fails
# loudly. Never touches a worktree's or the main checkout's database.
set -euo pipefail
if [[ "${RUN_SEED_RESTORE_TESTS:-}" != 1 ]]; then
  echo "SKIP - set RUN_SEED_RESTORE_TESTS=1 (or run: just seed-restore-test)"
  exit 0
fi
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

IMAGE="$(awk '/image: pgvector\/pgvector/{print $2; exit}' "$REPO_ROOT/docker-compose.yml")"
[[ -n "$IMAGE" ]] || { echo "Could not read the db image from docker-compose.yml" >&2; exit 1; }
ROWS="${SEED_TEST_ROWS:-110000}"
NAME="seed-restore-test-$$"
PGPW="$(openssl rand -hex 12)"
WORK="$(mktemp -d)"
cleanup() {
  docker rm -f -v "$NAME" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

pg() { docker exec -e PGPASSWORD="$PGPW" "$NAME" "$@"; }
restore() { # restore DUMP: the exact remote script setup.sh uses, dump on stdin
  docker exec -i -e POSTGRES_PASSWORD="$PGPW" "$NAME" sh -c "$(seed_restore_remote_script)" <"$1"
}
fail=0
check() {
  if "${@:2}"; then echo "ok - $1"; else echo "FAIL - $1"; fail=$((fail + 1)); fi
}
row_count() { pg psql -U djplaylist -d djplaylist -tAc "select count(*) from big" | tr -d '[:space:]'; }
size_mb() { echo $(($(wc -c <"$1") / 1048576)); }

# Same shape as the compose db service: non-root, /tmp is a 64 MB tmpfs, 1 GB.
docker run -d --name "$NAME" --user postgres --memory 1g --tmpfs /tmp:size=64m \
  -e POSTGRES_USER=djplaylist -e POSTGRES_DB=djplaylist -e POSTGRES_PASSWORD="$PGPW" \
  "$IMAGE" postgres -c maintenance_work_mem=256MB >/dev/null
for _ in $(seq 60); do
  pg pg_isready -U djplaylist -d djplaylist >/dev/null 2>&1 && break
  sleep 1
done
pg pg_isready -U djplaylist -d djplaylist >/dev/null

# Random md5 text does not compress, so the custom-format dump stays large.
pg psql -U djplaylist -d djplaylist -q -c \
  "create table big as select g id, (select string_agg(md5(random()::text||i::text),'') from generate_series(1,40) i where g > 0) t from generate_series(1,$ROWS) g;"
expected="$(row_count)"

pg pg_dump -U djplaylist -d djplaylist -Fc --no-owner --no-acl >"$WORK/pipe.dump"
pg sh -c 'pg_dump -U djplaylist -d djplaylist -Fc --no-owner --no-acl -f /var/lib/postgresql/file.dump'
docker cp "$NAME:/var/lib/postgresql/file.dump" "$WORK/file.dump"
head -c "$(($(wc -c <"$WORK/pipe.dump") * 3 / 4))" "$WORK/pipe.dump" >"$WORK/trunc.dump"
echo "rows=$expected pipe.dump=$(size_mb "$WORK/pipe.dump")MB file.dump=$(size_mb "$WORK/file.dump")MB truncated=$(size_mb "$WORK/trunc.dump")MB (tmpfs /tmp = 64MB)"
check "dump is larger than the 64 MB tmpfs" test "$(size_mb "$WORK/pipe.dump")" -gt 64

# The pre-fix approach: stage the dump in /tmp. It must fail at this size.
check "staging in /tmp fails at this size (the bug)" bash -c \
  "! docker exec -i '$NAME' sh -c 'cat > /tmp/worktree-seed.dump' <'$WORK/pipe.dump' 2>/dev/null"

for kind in pipe file; do
  pg psql -U djplaylist -d djplaylist -q -c "drop table if exists big"
  rc=0
  restore "$WORK/$kind.dump" >"$WORK/$kind.log" 2>&1 || rc=$?
  check "$kind-written dump restores via stdin (exit 0)" test "$rc" -eq 0
  check "$kind-written dump restores every row" test "$(row_count)" = "$expected"
done

# Truncated: must fail and must not leave a half-restored table behind.
rc=0
restore "$WORK/trunc.dump" >"$WORK/trunc.log" 2>&1 || rc=$?
check "truncated dump exits non-zero" test "$rc" -ne 0
check "truncated dump reports the failure" grep -q "error" "$WORK/trunc.log"
check "truncated dump leaves no partial table (single transaction)" test \
  "$(pg psql -U djplaylist -d djplaylist -tAc "select count(*) from information_schema.tables where table_schema='public'" | tr -d '[:space:]')" = 0
check "password is not in restore output" bash -c "! grep -q '$PGPW' '$WORK'/*.log"

if ((fail == 0)); then echo "All seed restore integration tests passed."; exit 0; fi
echo "$fail seed restore integration test(s) failed."
exit 1
