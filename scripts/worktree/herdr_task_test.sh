#!/usr/bin/env bash
# Self-test for herdr-task.sh's hand-off to herdr-agent: plain assertions
# against a stub herdr-agent that prints the arguments it was given, one per
# line. Run directly; touches no herdr, Docker, Caddy, or git state.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STUB_DIR="$(mktemp -d)"
trap 'rm -rf "$STUB_DIR"' EXIT
cat >"$STUB_DIR/herdr-agent" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$@"
EOF
chmod +x "$STUB_DIR/herdr-agent"
export HERDR_AGENT_BIN="$STUB_DIR/herdr-agent"

failures=0

# Runs herdr-task.sh and joins the arguments herdr-agent received with '|'.
handoff() {
  "$SCRIPT_DIR/herdr-task.sh" "$@" | paste -sd '|' -
}

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "ok - $label"
  else
    echo "FAIL - $label: expected [$expected], got [$actual]"
    failures=$((failures + 1))
  fi
}

assert_eq "defaults to origin/main and the repo's own setup" \
  "feat/x|--base|origin/main" "$(handoff feat/x)"

assert_eq "--base overrides the default" \
  "feat/x|--base|main" "$(handoff feat/x --base main)"

assert_eq "--no-stack bootstraps without a stack" \
  "feat/x|--base|origin/main|--setup|just worktree-setup --no-stack" "$(handoff feat/x --no-stack)"

assert_eq "--no-bootstrap only starts the stack" \
  "feat/x|--base|origin/main|--setup|just worktree-up" "$(handoff feat/x --no-bootstrap)"

assert_eq "both skip setup entirely" \
  "feat/x|--base|origin/main|--no-setup" "$(handoff feat/x --no-bootstrap --no-stack)"

assert_eq "herdr-agent options pass through, values intact" \
  "feat/x|--base|origin/main|--model|claude-sonnet-5-5|--prompt|two words|--dry-run" \
  "$(handoff feat/x --model claude-sonnet-5-5 --prompt "two words" --dry-run)"

issue_args="$(handoff feat/x --issue 42)"
if [[ "$issue_args" == "feat/x|--base|origin/main|--prompt|Fix issue #42 "* && "$issue_args" == *"closes #42." ]]; then
  echo "ok - --issue builds the default prompt"
else
  echo "FAIL - --issue builds the default prompt: got [$issue_args]"
  failures=$((failures + 1))
fi

if "$SCRIPT_DIR/herdr-task.sh" feat/x --issue abc >/dev/null 2>&1; then
  echo "FAIL - a non-numeric --issue is refused"
  failures=$((failures + 1))
else
  echo "ok - a non-numeric --issue is refused"
fi

if HERDR_AGENT_BIN="$STUB_DIR/missing" "$SCRIPT_DIR/herdr-task.sh" feat/x >/dev/null 2>&1; then
  echo "FAIL - a missing herdr-agent is reported"
  failures=$((failures + 1))
else
  echo "ok - a missing herdr-agent is reported"
fi

if [[ "$failures" -gt 0 ]]; then
  echo "$failures failure(s)"
  exit 1
fi
echo "all passed"
