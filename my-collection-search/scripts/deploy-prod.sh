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
OP_BIN="$(command -v op || true)"
COMPOSE_CMD=()
if [[ -n "${COMPOSE_ENV_FILE}" ]]; then
  COMPOSE_CMD=(docker compose --env-file "${COMPOSE_ENV_FILE}")
elif [[ -n "${COMPOSE_TEMPLATE_FILE}" && -n "${OP_BIN}" ]]; then
  COMPOSE_CMD=(op run --env-file "${COMPOSE_TEMPLATE_FILE}" -- docker compose)
else
  COMPOSE_CMD=(docker compose)
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

echo "==> Fetching tags and checking out ${TAG}"
git fetch --tags
git checkout "${TAG}"

if [[ -n "${COMPOSE_ENV_FILE}" ]]; then
  echo "==> Using env file ${COMPOSE_ENV_FILE}"
elif [[ -n "${COMPOSE_TEMPLATE_FILE}" && -n "${OP_BIN}" ]]; then
  echo "==> Using 1Password template ${COMPOSE_TEMPLATE_FILE}"
else
  echo "WARNING: no .env or usable .env.tpl found"
fi

echo "==> Checking disk space"
check_disk_space

echo "==> Pulling images for ${TAG}"
IMAGE_TAG="${TAG}" "${COMPOSE_CMD[@]}" -p "${PROJECT_NAME}" "${COMPOSE_FILES[@]}" pull "${SERVICES[@]}"

echo "==> Starting database dependencies"
IMAGE_TAG="${TAG}" "${COMPOSE_CMD[@]}" -p "${PROJECT_NAME}" "${COMPOSE_FILES[@]}" up -d db redis
wait_for_db_ready

echo "==> Running migrations"
IMAGE_TAG="${TAG}" "${COMPOSE_CMD[@]}" -p "${PROJECT_NAME}" "${COMPOSE_FILES[@]}" run --rm --use-aliases migrate
verify_latest_migration_applied

echo "==> Starting services"
IMAGE_TAG="${TAG}" "${COMPOSE_CMD[@]}" -p "${PROJECT_NAME}" "${COMPOSE_FILES[@]}" up -d --remove-orphans

echo "==> Deployment complete"
