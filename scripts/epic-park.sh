#!/usr/bin/env bash
# Park or unpark an epic: toggles the `parked` label on the epic and all of its
# sub-issues, so `-label:parked` hides work you are not ready to start.
set -euo pipefail

REPO="${GITHUB_REPO:-Public-Vinyl-Radio/groovenet}"
LABEL="parked"

if [[ $# -ne 2 || ! "$1" =~ ^(park|unpark)$ || ! "$2" =~ ^[0-9]+$ ]]; then
  echo "Usage: $(basename "$0") <park|unpark> <epic-issue-number>" >&2
  exit 1
fi
action="$1"
epic="$2"

gh label create "$LABEL" --repo "$REPO" --color 6e7781 \
  --description "Not ready to work on; hidden with -label:parked" 2>/dev/null || true

children="$(gh api --paginate "repos/$REPO/issues/$epic/sub_issues" -q '.[].number')"
for n in "$epic" $children; do
  if [[ "$action" == park ]]; then
    gh issue edit "$n" --repo "$REPO" --add-label "$LABEL" >/dev/null
  else
    gh issue edit "$n" --repo "$REPO" --remove-label "$LABEL" >/dev/null
  fi
  echo "#$n ${action}ed"
done
