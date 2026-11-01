#!/usr/bin/env bash
set -u

# Netlify: exit 0 skips; any non-zero builds. Hook builds bypass cancellation.
# https://docs.netlify.com/build/configure-builds/ignore-builds/
# CONTEXT identifies the deploy type; COMMIT_REF is the build SHA and
# CACHED_COMMIT_REF is the last built SHA (equal to COMMIT_REF without cache).
# HEAD and BRANCH are branch names, not commit SHAs. INCOMING_HOOK_TITLE,
# INCOMING_HOOK_URL and INCOMING_HOOK_BODY identify a build-hook request.
# https://docs.netlify.com/build/configure-builds/environment-variables/#read-only-variables

build() {
  printf 'netlify-ignore: build, %s\n' "$1"
  exit 1
}

if [ -n "${INCOMING_HOOK_TITLE:-}${INCOMING_HOOK_URL:-}${INCOMING_HOOK_BODY:-}" ]; then
  build 'build hook request'
fi

case "${CONTEXT:-}" in
  deploy-preview)
    head=$(git rev-parse --verify 'HEAD^{commit}' 2>/dev/null) || build 'cannot resolve preview HEAD'
    # Explicit refspec also updates origin/main in single-branch clones.
    main_ref='+refs/heads/main:refs/remotes/origin/main'
    git fetch --quiet --no-tags --depth=200 origin "$main_ref" >/dev/null 2>&1 || build 'cannot fetch origin/main'
    if ! base=$(git merge-base origin/main "$head" 2>/dev/null); then
      shallow=$(git rev-parse --is-shallow-repository 2>/dev/null) || build 'cannot inspect shallow history'
      [ "$shallow" = true ] || build 'no merge-base with origin/main'
      # Fetch both histories: deepening main alone can leave the PR head shallow.
      git fetch --quiet --no-tags --unshallow origin "$main_ref" "$head" >/dev/null 2>&1 || build 'cannot deepen preview history'
      base=$(git merge-base origin/main "$head" 2>/dev/null) || build 'no merge-base after deepening'
    fi
    ;;
  production|branch-deploy)
    [ -n "${CACHED_COMMIT_REF:-}" ] || build 'CACHED_COMMIT_REF is missing'
    [ -n "${COMMIT_REF:-}" ] || build 'COMMIT_REF is missing'
    head=$(git rev-parse --verify "${COMMIT_REF}^{commit}" 2>/dev/null) || build 'cannot resolve COMMIT_REF'
    if ! base=$(git rev-parse --verify "${CACHED_COMMIT_REF}^{commit}" 2>/dev/null); then
      git fetch --quiet --no-tags --depth=200 origin "$CACHED_COMMIT_REF" >/dev/null 2>&1 || build 'cannot fetch CACHED_COMMIT_REF'
      base=$(git rev-parse --verify "${CACHED_COMMIT_REF}^{commit}" 2>/dev/null) || build 'cannot resolve fetched CACHED_COMMIT_REF'
    fi
    ;;
  *) build 'unknown or missing CONTEXT' ;;
esac

# Relative to Netlify's site/ base directory. Mirror the content paths in
# .github/scripts/ci-changes.mjs; netlify-ignore.test.mjs checks both filters.
# --no-renames ensures moving a watched file out of these paths still builds.
git diff --quiet --no-ext-diff --no-renames "$base" "$head" -- . ../docs ../CHANGELOG.md 2>/dev/null
result=$?
case "$result" in
  0) printf 'netlify-ignore: skip, no changes under site/ docs/ CHANGELOG.md since %s\n' "$base" ;;
  1) build "changes under site/ docs/ CHANGELOG.md since $base" ;;
  *) build 'git diff failed' ;;
esac
