#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

# A project name only this tool could have produced: "dj-" + anything +
# "-" + a 6-char lowercase-hex path hash. Anything else (the main
# checkout's default "dj-playlist", or a pre-herdr supacode project like
# "feat-375-genre-filter") is reported but never touched.
PROJECT_NAME_PATTERN='^dj-.+-[0-9a-f]{6}$'

APPLY=false
KEEP_VOLUMES=false

print_usage() {
  cat <<EOF
Usage: $(basename "$0") [--apply] [--keep-volumes]
       $(basename "$0") --self-test

Finds Docker Compose stacks and Caddy vhost fragments left behind by
worktrees that no longer exist (removed via 'herdr worktree remove',
'git worktree remove', or by hand) and tears them down.

A compose project counts as orphaned when its name matches this tool's
naming scheme ("dj-<branch-slug>-<path-hash>") but matches no worktree
currently known to git. Projects whose name doesn't match that scheme
(the main checkout's default project, or an old pre-herdr supacode
project) are listed as unknown and never touched. A Caddy fragment counts
as orphaned the same way, independent of whether a matching project
still exists.

Dry run by default: prints what would be removed. Pass --apply to do it.

  --apply          actually remove orphaned stacks and Caddy fragments
  --keep-volumes   skip 'docker compose down -v' (keep named volumes)
  --self-test      check slug/project-name derivation against known
                    inputs and exit; does not touch Docker or Caddy
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      continue
      ;;
    --apply)
      APPLY=true
      shift
      ;;
    --keep-volumes)
      KEEP_VOLUMES=true
      shift
      ;;
    --self-test)
      exec "$SCRIPT_DIR/lib_test.sh"
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      usage_error "Unknown argument: $1 (see --help)"
      ;;
  esac
done

require_command git docker jq

declare -A live_projects=()
declare -A live_slugs=()

register_live() {
  local project="$1" slug="$2"
  [[ -n "$project" ]] && live_projects["$project"]=1
  [[ -n "$slug" ]] && live_slugs["$slug"]=1
}

# Beyond the project/slug computed from the worktree's *current* branch,
# also trust every COMPOSE_PROJECT_NAME/WORKTREE_SLUG this worktree's own
# .worktree/*.env files remember. A branch rename changes the slug going
# forward, but a stack created under the old name can still be live and
# must never be reported as orphaned just because the branch moved on.
register_env_files() {
  local wt_path="$1" env_file project slug
  [[ -d "$wt_path/.worktree" ]] || return 0
  while IFS= read -r env_file; do
    project="$(sed -n 's/^COMPOSE_PROJECT_NAME=//p' "$env_file" | head -n1)"
    slug="$(sed -n 's/^WORKTREE_SLUG=//p' "$env_file" | head -n1)"
    register_live "$project" "$slug"
  done < <(find "$wt_path/.worktree" -maxdepth 1 -type f -name '*.env' 2>/dev/null)
}

while IFS=$'\t' read -r wt_path wt_branch; do
  [[ -n "$wt_path" ]] || continue
  register_live "$(compose_project_name "$wt_path" "$wt_branch")" "$(worktree_slug "$wt_path" "$wt_branch")"
  register_env_files "$wt_path"
done < <(worktree_list_entries)

orphan_projects=()
unknown_projects=()
declare -A handled_slugs=()
fragment_removed=false

while IFS= read -r row; do
  [[ -n "$row" ]] || continue
  name="$(jq -r '.Name' <<<"$row")"
  status="$(jq -r '.Status' <<<"$row")"

  if [[ ! "$name" =~ $PROJECT_NAME_PATTERN ]]; then
    unknown_projects+=("$name")
    continue
  fi

  if [[ -n "${live_projects[$name]:-}" ]]; then
    continue
  fi

  orphan_projects+=("$name"$'\t'"$status")
done < <(docker compose ls --all --format json | jq -c '.[]')

if ((${#orphan_projects[@]} > 0)); then
  echo "Orphaned compose projects:"
  for entry in "${orphan_projects[@]}"; do
    name="${entry%%$'\t'*}"
    status="${entry#*$'\t'}"
    slug="${name#dj-}"
    handled_slugs["$slug"]=1
    fragment="$CADDY_WORKTREE_DIR/$slug.caddy"

    down_args=(down --remove-orphans)
    [[ "$KEEP_VOLUMES" == true ]] || down_args+=(-v)

    if [[ "$APPLY" == true ]]; then
      echo "  removing $name ($status)"
      docker compose -p "$name" "${down_args[@]}"
      if [[ -f "$fragment" ]]; then
        rm -f "$fragment"
        echo "  removed Caddy fragment $fragment"
        fragment_removed=true
      fi
    else
      echo "  $name ($status)"
      echo "    would run: docker compose -p $name ${down_args[*]}"
      if [[ -f "$fragment" ]]; then
        echo "    would remove Caddy fragment: $fragment"
      fi
    fi
  done
fi

if ((${#unknown_projects[@]} > 0)); then
  echo "Unknown compose projects (not prefixed dj-<slug>-<hash>, not touched):"
  for name in "${unknown_projects[@]}"; do
    echo "  $name"
  done
fi

orphan_fragments=()
if [[ -d "$CADDY_WORKTREE_DIR" ]]; then
  for fragment in "$CADDY_WORKTREE_DIR"/*.caddy; do
    [[ -e "$fragment" ]] || continue
    stem="$(basename "$fragment" .caddy)"
    [[ -n "${handled_slugs[$stem]:-}" ]] && continue
    [[ -n "${live_slugs[$stem]:-}" ]] && continue
    orphan_fragments+=("$fragment")
  done
fi

if ((${#orphan_fragments[@]} > 0)); then
  echo "Orphaned Caddy fragments (no matching worktree or compose project):"
  for fragment in "${orphan_fragments[@]}"; do
    if [[ "$APPLY" == true ]]; then
      rm -f "$fragment"
      echo "  removed $fragment"
      fragment_removed=true
    else
      echo "  would remove: $fragment"
    fi
  done
fi

if ((${#orphan_projects[@]} == 0 && ${#unknown_projects[@]} == 0 && ${#orphan_fragments[@]} == 0)); then
  echo "Nothing to clean up."
fi

if [[ "$APPLY" == true && "$fragment_removed" == true ]]; then
  if command -v caddy >/dev/null 2>&1; then
    reload_caddy
    echo "Reloaded Caddy."
  else
    echo "caddy not installed; skipping reload."
  fi
fi

if [[ "$APPLY" != true ]] && ((${#orphan_projects[@]} > 0 || ${#orphan_fragments[@]} > 0)); then
  echo
  echo "Dry run — nothing changed. Re-run with --apply to remove the orphans above."
fi
