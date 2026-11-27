#!/usr/bin/env bash
set -euo pipefail

TAG="${1:-}"
if [[ -z "${TAG}" ]]; then
  echo "Usage: $0 <tag>"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_DIR}"

PROJECT_NAME="${PROJECT_NAME:-dj-playlist}"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.prod.yml)
if [[ -f "${PROJECT_DIR}/.env" ]]; then
  COMPOSE_ENV_FILE="${PROJECT_DIR}/.env"
elif [[ -f "${PROJECT_DIR}/my-collection-search/.env" ]]; then
  COMPOSE_ENV_FILE="${PROJECT_DIR}/my-collection-search/.env"
else
  COMPOSE_ENV_FILE=""
fi
if [[ -f "${PROJECT_DIR}/.env.tpl" ]]; then
  COMPOSE_TEMPLATE_FILE="${PROJECT_DIR}/.env.tpl"
elif [[ -f "${PROJECT_DIR}/my-collection-search/.env.tpl" ]]; then
  COMPOSE_TEMPLATE_FILE="${PROJECT_DIR}/my-collection-search/.env.tpl"
else
  COMPOSE_TEMPLATE_FILE=""
fi
# Read one KEY= line from an env file (last wins). The files hold secrets, so
# they are never sourced; only this line is parsed.
env_file_value() {
  local file="$1" key="$2"
  grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$file" | tail -n 1 |
    sed -E "s/^[[:space:]]*(export[[:space:]]+)?${key}=//; s/\r\$//; s/^[[:space:]]*[\"']//; s/[\"'][[:space:]]*\$//"
}
env_file_has() {
  [[ -n "$1" && -f "$1" ]] && grep -Eq "^[[:space:]]*(export[[:space:]]+)?$2=" "$1"
}

# Host-local deploy settings (COMPOSE_PROFILES, GAMDL_WRAPPER_IMAGE, ...). Never
# rendered from 1Password and never overwritten by a deploy, so a host keeps its
# own choices across releases.
HOST_ENV_FILE="${PROJECT_DIR}/.env.host"

# One effective profile list, exported so every compose call sees it. An
# explicit `--profile` flag would REPLACE COMPOSE_PROFILES rather than add to
# it, so server players are appended to the list instead of passed as a flag.
# Precedence: shell value (even empty) > .env.host > .env/.env.tpl > default.
profile_file="${COMPOSE_ENV_FILE:-$COMPOSE_TEMPLATE_FILE}"
if [[ -n "${COMPOSE_PROFILES+x}" ]]; then
  PROFILES="${COMPOSE_PROFILES}"
  PROFILES_SOURCE="shell"
elif env_file_has "$HOST_ENV_FILE" COMPOSE_PROFILES; then
  PROFILES="$(env_file_value "$HOST_ENV_FILE" COMPOSE_PROFILES)"
  PROFILES_SOURCE="${HOST_ENV_FILE}"
elif env_file_has "$profile_file" COMPOSE_PROFILES; then
  PROFILES="$(env_file_value "$profile_file" COMPOSE_PROFILES)"
  PROFILES_SOURCE="${profile_file}"
else
  PROFILES=all
  PROFILES_SOURCE="default"
fi
if [[ -f "${PROJECT_DIR}/.env.players" ]]; then
  case ",${PROFILES// /}," in
    *,players,*) ;;
    ,,) PROFILES=players ;;
    *) PROFILES="${PROFILES},players" ;;
  esac
fi
export COMPOSE_PROFILES="${PROFILES}"
OP_BIN="$(command -v op || true)"
COMPOSE_CMD=()
if [[ -n "${COMPOSE_ENV_FILE}" ]]; then
  COMPOSE_CMD=(docker compose --env-file "${COMPOSE_ENV_FILE}")
elif [[ -n "${COMPOSE_TEMPLATE_FILE}" && -n "${OP_BIN}" ]]; then
  # `env` re-asserts the list inside op run, so a template line cannot override it.
  COMPOSE_CMD=(op run --env-file "${COMPOSE_TEMPLATE_FILE}" -- env "COMPOSE_PROFILES=${PROFILES}" docker compose)
else
  COMPOSE_CMD=(docker compose)
fi
# .env.host comes after .env so a host-local value wins over the rendered one.
if [[ -f "${HOST_ENV_FILE}" ]]; then
  COMPOSE_CMD+=(--env-file "${HOST_ENV_FILE}")
fi
# Keep host-private player settings separate from the .env rendered on deploy.
# File presence is the explicit opt-in; preserve players during --remove-orphans.
SERVER_PLAYERS_ENABLED=false
if [[ -f "${PROJECT_DIR}/.env.players" ]]; then
  SERVER_PLAYERS_ENABLED=true
  COMPOSE_CMD+=(--env-file "${PROJECT_DIR}/.env.players")
  COMPOSE_FILES+=(-f docker-compose.players.yml)
fi
# The local backup disk is opt-in by variable: only a host that sets LOCAL_BACKUP_PATH
# in .env.host gets the extra mount.
if [[ -f "${HOST_ENV_FILE}" && -n "$(env_file_value "$HOST_ENV_FILE" LOCAL_BACKUP_PATH || true)" ]]; then
  COMPOSE_FILES+=(-f docker-compose.local-backup.yml)
fi
SERVICES=(app migrate essentia ga-service download-worker fingerprint-service fingerprint-set-worker)
MIN_FREE_GB="${MIN_FREE_GB:-5}"
PGUSER="${POSTGRES_USER:-djplaylist}"
PGDB="${POSTGRES_DB:-djplaylist}"

latest_migration_name() {
  find "${PROJECT_DIR}/my-collection-search/migrations" -maxdepth 1 -name '*.js' -type f \
    -exec basename {} .js \; | sort | tail -n 1
}

verify_latest_migration_applied() {
  local migration_name applied
  migration_name="$(latest_migration_name)"
  applied="$(IMAGE_TAG="${TAG}" "${COMPOSE_CMD[@]}" -p "${PROJECT_NAME}" "${COMPOSE_FILES[@]}" exec -T db \
    psql -U "${PGUSER}" -d "${PGDB}" -tAc \
    "SELECT EXISTS(SELECT 1 FROM pgmigrations WHERE name = '${migration_name}')" | tr -d ' ' || echo "f")"
  if [[ "${applied}" != "t" ]]; then
    echo "ERROR: latest migration ${migration_name} is not recorded in pgmigrations"
    exit 1
  fi
}

check_disk_space() {
  local avail_kb required_kb
  avail_kb="$(df -Pk "${PROJECT_DIR}" | awk 'NR==2 {print $4}')"
  required_kb=$((MIN_FREE_GB * 1024 * 1024))
  if (( avail_kb < required_kb )); then
    echo "ERROR: low disk space. Need >= ${MIN_FREE_GB}GB free before deploy."
    echo "Available: $((avail_kb / 1024 / 1024))GB"
    exit 1
  fi
}

wait_for_db_ready() {
  local timeout_s=120 elapsed=0
  echo "==> Waiting for PostgreSQL readiness"
  until IMAGE_TAG="${TAG}" "${COMPOSE_CMD[@]}" -p "${PROJECT_NAME}" "${COMPOSE_FILES[@]}" exec -T db \
    pg_isready -U "${PGUSER}" -d "${PGDB}" >/dev/null 2>&1; do
    sleep 2
    elapsed=$((elapsed + 2))
    if (( elapsed >= timeout_s )); then
      echo "ERROR: Postgres did not become ready within ${timeout_s}s"
      IMAGE_TAG="${TAG}" "${COMPOSE_CMD[@]}" -p "${PROJECT_NAME}" "${COMPOSE_FILES[@]}" logs --tail=200 db || true
      exit 1
    fi
  done
}

# A release candidate (`just deploy-rc`) is deployed by its image tag,
# sha-<short>, which is not a git ref; the commit it was built from is.
GIT_REF="${TAG}"
if [[ "${TAG}" =~ ^sha-([0-9a-f]{7,40})$ ]]; then
  GIT_REF="${BASH_REMATCH[1]}"
fi

echo "==> Fetching tags and checking out ${GIT_REF}"
git fetch --tags
git checkout "${GIT_REF}"

if [[ -n "${COMPOSE_ENV_FILE}" ]]; then
  echo "==> Using env file ${COMPOSE_ENV_FILE}"
elif [[ -n "${COMPOSE_TEMPLATE_FILE}" && -n "${OP_BIN}" ]]; then
  echo "==> Using 1Password template ${COMPOSE_TEMPLATE_FILE}"
else
  echo "WARNING: no .env or usable .env.tpl found"
fi

echo "==> Compose profiles: ${PROFILES:-<none>} (from ${PROFILES_SOURCE})"

# The lossless wrapper is built locally and never pulled; a missing image would
# otherwise fail only after the pull has already replaced running services.
if [[ ",${PROFILES// /}," == *,lossless,* ]]; then
  WRAPPER_IMAGE="${GAMDL_WRAPPER_IMAGE:-}"
  if [[ -z "${WRAPPER_IMAGE}" ]] && env_file_has "$HOST_ENV_FILE" GAMDL_WRAPPER_IMAGE; then
    WRAPPER_IMAGE="$(env_file_value "$HOST_ENV_FILE" GAMDL_WRAPPER_IMAGE)"
  fi
  if [[ -z "${WRAPPER_IMAGE}" ]] && env_file_has "$profile_file" GAMDL_WRAPPER_IMAGE; then
    WRAPPER_IMAGE="$(env_file_value "$profile_file" GAMDL_WRAPPER_IMAGE)"
  fi
  WRAPPER_IMAGE="${WRAPPER_IMAGE:-wrapper-v2:1.0.0-local-amd64}"
  if ! docker image inspect "${WRAPPER_IMAGE}" >/dev/null 2>&1; then
    echo "ERROR: the lossless profile is enabled but wrapper image ${WRAPPER_IMAGE} is not on this host."
    echo "Build it first (see download-worker/docs/lossless-alac.md) or remove lossless from COMPOSE_PROFILES."
    exit 1
  fi
fi

echo "==> Checking disk space"
check_disk_space

echo "==> Pulling images for ${TAG}"
IMAGE_TAG="${TAG}" "${COMPOSE_CMD[@]}" -p "${PROJECT_NAME}" "${COMPOSE_FILES[@]}" pull "${SERVICES[@]}"

if [[ "${SERVER_PLAYERS_ENABLED}" == true ]]; then
  echo "==> Building persistent player images"
  IMAGE_TAG="${TAG}" "${COMPOSE_CMD[@]}" -p "${PROJECT_NAME}" "${COMPOSE_FILES[@]}" build player-clock player-worker
fi

echo "==> Starting database dependencies"
IMAGE_TAG="${TAG}" "${COMPOSE_CMD[@]}" -p "${PROJECT_NAME}" "${COMPOSE_FILES[@]}" up -d db redis
wait_for_db_ready

echo "==> Running migrations"
IMAGE_TAG="${TAG}" "${COMPOSE_CMD[@]}" -p "${PROJECT_NAME}" "${COMPOSE_FILES[@]}" run --rm --use-aliases migrate
verify_latest_migration_applied

echo "==> Starting services"
IMAGE_TAG="${TAG}" "${COMPOSE_CMD[@]}" -p "${PROJECT_NAME}" "${COMPOSE_FILES[@]}" up -d --remove-orphans

echo "==> Deployment complete"
