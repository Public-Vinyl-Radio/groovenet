#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"
[[ "${1:-}" == -- ]] && shift
command="${1:-}"
shift || true
case "$command" in
  list)
    [[ $# == 0 ]] || usage_error "list takes no profiles"
    ensure_worktree_env
    echo "${COMPOSE_PROFILES:-none}"
    ;;
  add|remove)
    [[ $# -gt 0 ]] || usage_error "$command requires profiles"
    requested="$(normalize_profiles "$(IFS=,; echo "$*")")"
    ensure_worktree_env
    old="${COMPOSE_PROFILES:-}"
    if [[ "$command" == add ]]; then
      new="$(normalize_profiles "${old:+$old,}$requested")"
      save_profiles "$new"
      compose_exec up -d
    else
      new=""
      for profile in ${old//,/ }; do
        case ",$requested," in *",$profile,"*) ;; *) new="${new:+$new,}$profile" ;; esac
      done
      old_services="$(compose_exec config --services)"
      save_profiles "$new"
      new_services="$(compose_exec config --services)"
      to_stop=()
      while IFS= read -r service; do
        [[ -n "$service" ]] || continue
        if ! printf '%s\n' "$new_services" | grep -Fxq "$service"; then to_stop+=("$service"); fi
      done <<<"$old_services"
      if ((${#to_stop[@]})); then compose_exec --profile '*' stop "${to_stop[@]}"; fi
    fi
    ;;
  *) usage_error "Usage: worktree-services add|remove PROFILE... | list" ;;
esac
