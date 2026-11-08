#!/usr/bin/env bash
# Exercise profile persistence and cleanup arguments without Docker or Caddy.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_DIR"' EXIT
export WORKTREE_STATE_DIR="$TEST_DIR/state" SEED_ROOT="$TEST_DIR/seeds" CADDY_WORKTREE_DIR="$TEST_DIR/caddy-dir"
export WORKTREE_LOCK_DIR="$TEST_DIR/lock" PATH="$TEST_DIR:$PATH" TEST_DIR
mkdir -p "$WORKTREE_STATE_DIR" "$SEED_ROOT" "$CADDY_WORKTREE_DIR"
cat >"$TEST_DIR/docker" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$TEST_DIR/calls"
if [[ " $* " == *" config --services "* ]]; then
  printf 'app\ndb\nredis\n'
  case ",${COMPOSE_PROFILES:-}," in *,downloads,*|*,analysis,*|*,all,*) echo essentia ;; esac
  case ",${COMPOSE_PROFILES:-}," in *,downloads,*|*,all,*) echo download-worker ;; esac
  case ",${COMPOSE_PROFILES:-}," in *,fingerprint,*|*,all,*) printf 'fingerprint-service\nfingerprint-set-worker\n' ;; esac
fi
exit 0
STUB
printf '#!/usr/bin/env bash\nexit 1\n' >"$TEST_DIR/op"
printf '#!/usr/bin/env bash\nexit 0\n' >"$TEST_DIR/caddy"
chmod +x "$TEST_DIR/docker" "$TEST_DIR/op" "$TEST_DIR/caddy"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"
cat >"$(worktree_env_file)" <<EOF_ENV
COMPOSE_PROJECT_NAME=$(compose_project_name "$REPO_ROOT" "$CURRENT_BRANCH")
WORKTREE_HOST=test
APP_PORT=34567
COMPOSE_PROFILES=
EOF_ENV
"$SCRIPT_DIR/services.sh" add downloads,analysis fingerprint
[[ "$("$SCRIPT_DIR/services.sh" list)" == downloads,analysis,fingerprint ]]
"$SCRIPT_DIR/services.sh" remove downloads
[[ "$("$SCRIPT_DIR/services.sh" list)" == analysis,fingerprint ]]
grep -q -- '--profile \* stop download-worker' "$TEST_DIR/calls"
if grep -q -- 'stop .*essentia' "$TEST_DIR/calls"; then exit 1; fi
if "$SCRIPT_DIR/services.sh" add invalid >/dev/null 2>&1; then exit 1; fi
"$SCRIPT_DIR/teardown.sh"
grep -q -- '--profile \* down --remove-orphans' "$TEST_DIR/calls"
echo 'profile and cleanup tests passed'
