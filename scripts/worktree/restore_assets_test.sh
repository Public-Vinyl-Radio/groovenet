#!/usr/bin/env bash
# Self-test for the bind-mount branch of restore-restic-assets.sh: parallel
# restores into one shared folder, no-clobber, and stale-lock recovery. Runs the
# real alpine:3.20 container; skips cleanly when Docker is unavailable.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESTORE="$SCRIPT_DIR/../../my-collection-search/scripts/restore-restic-assets.sh"

if ! docker info >/dev/null 2>&1; then
  echo "SKIP - docker is not available"
  exit 0
fi

TEST_TMP="$(mktemp -d)"
trap 'rm -rf "$TEST_TMP"' EXIT

FAIL_FILE="$TEST_TMP/failures"
: >"$FAIL_FILE"
check() {
  local label="$1"
  shift
  if "$@"; then
    echo "ok - $label"
  else
    echo "FAIL - $label"
    echo x >>"$FAIL_FILE"
  fi
}

# A fake `docker inspect` is not needed: stub it so the script sees a bind mount.
STUB_BIN="$TEST_TMP/bin"
mkdir -p "$STUB_BIN"
REAL_DOCKER="$(command -v docker)"
cat >"$STUB_BIN/docker" <<STUB
#!/usr/bin/env bash
if [[ "\$1" == inspect ]]; then
  echo "/app/public/uploads/album-covers | bind | \$BIND_DEST |"
  exit 0
fi
exec "$REAL_DOCKER" "\$@"
STUB
chmod +x "$STUB_BIN/docker"
export PATH="$STUB_BIN:$PATH"

make_restore() {
  local dir="$1" n="$2" i
  mkdir -p "$dir/app/public/uploads/album-covers"
  for ((i = 1; i <= n; i++)); do
    echo "src-$i" >"$dir/app/public/uploads/album-covers/cover_$i.jpg"
  done
}

restore() {
  BIND_DEST="$1" "$RESTORE" --restore-target "$2" >"$TEST_TMP/restore.log" 2>&1
}

files_present() {
  local dest="$1" n="$2" i
  for ((i = 1; i <= n; i++)); do
    [[ "$(cat "$dest/cover_$i.jpg" 2>/dev/null)" == "src-$i" ]] || return 1
  done
}

# --- parallel restores into one bind folder ---
SRC="$TEST_TMP/src"
DEST="$TEST_TMP/dest"
make_restore "$SRC" 300
mkdir -p "$DEST"
restore "$DEST" "$SRC" &
pid1=$!
restore "$DEST" "$SRC" &
pid2=$!
rc1=0 rc2=0
wait "$pid1" || rc1=$?
wait "$pid2" || rc2=$?
check "parallel restores both exit 0" test "$rc1" -eq 0 -a "$rc2" -eq 0
check "parallel restores leave every file intact" files_present "$DEST" 300
check "lock is released afterwards" test ! -e "$DEST/.restore.lock"

# --- no clobber ---
DEST2="$TEST_TMP/dest2"
mkdir -p "$DEST2"
echo "keep-me" >"$DEST2/cover_1.jpg"
restore "$DEST2" "$SRC"
check "existing file is not overwritten" test "$(cat "$DEST2/cover_1.jpg")" = keep-me
check "missing files are still added" test "$(cat "$DEST2/cover_2.jpg")" = src-2

# --- stale lock ---
DEST3="$TEST_TMP/dest3"
mkdir -p "$DEST3/.restore.lock"
touch -t 200001010000 "$DEST3/.restore.lock"
rc=0
BIND_DEST="$DEST3" timeout 120 "$RESTORE" --restore-target "$SRC" >/dev/null 2>&1 || rc=$?
check "stale lock is cleared, restore exits 0" test "$rc" -eq 0
check "stale lock restore copies files" files_present "$DEST3" 300
check "no lock left behind" test ! -e "$DEST3/.restore.lock"

# --- dry run mentions no-clobber ---
out="$(BIND_DEST="$TEST_TMP/dry" "$RESTORE" --restore-target "$SRC" --dry-run)"
check "dry-run mentions no-clobber" grep -q "no-clobber" <<<"$out"

failures="$(wc -l <"$FAIL_FILE" | tr -d ' ')"
echo
if ((failures == 0)); then
  echo "All self-tests passed."
  exit 0
fi
echo "$failures self-test(s) failed."
exit 1
