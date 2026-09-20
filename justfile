set shell := ["bash", "-euo", "pipefail", "-c"]

app_dir := env_var_or_default("APP_DIR", "my-collection-search")
buildkit_env := env_var_or_default("BUILDKIT_ENV", "DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1")
registry := env_var_or_default("REGISTRY", "ghcr.io/public-vinyl-radio")
platform := env_var_or_default("PLATFORM", "linux/amd64")
prod_host := env_var_or_default("PROD_HOST", "your-server.example.com")
prod_stack_dir := env_var_or_default("PROD_STACK_DIR", "/opt/stacks/groovenet")
ssh_user := env_var_or_default("SSH_USER", "deploy")
tag_prefix := env_var_or_default("TAG_PREFIX", "v")
tag_time := `date -u +%Y%m%dT%H%M%SZ`
tag := env_var_or_default("TAG", tag_prefix + tag_time)
album_covers_remote_host := env_var_or_default("ALBUM_COVERS_REMOTE_HOST", ssh_user + "@" + prod_host)
album_covers_remote_path := env_var_or_default("ALBUM_COVERS_REMOTE_PATH", "/var/lib/docker/volumes/groovenet_album_covers/_data")
album_covers_local_dir := env_var_or_default("ALBUM_COVERS_LOCAL_DIR", env_var_or_default("HOME", "") + "/groovenet-covers")
asset_sync_host := env_var_or_default("ASSET_SYNC_HOST", "")
music_mount := env_var_or_default("MUSIC_MOUNT", env_var_or_default("HOME", "") + "/groovenet-music")
music_nfs_host := env_var_or_default("MUSIC_NFS_HOST", "")
music_nfs_path := env_var_or_default("MUSIC_NFS_PATH", "/srv/music")
op_env := "op run --env-file=.env.tpl --"
compose_cmd := `if docker compose version >/dev/null 2>&1; then echo "docker compose"; elif command -v docker-compose >/dev/null 2>&1; then echo "docker-compose"; fi`
platform_override := if os() == "macos" { "-f docker-compose.mac.yml" } else { "" }
mise_exec := "mise exec --"

default:
  @just --list

bootstrap: bootstrap-js bootstrap-python bootstrap-hooks

bootstrap-js: bootstrap-tools bootstrap-node

bootstrap-tools:
  @command -v mise >/dev/null 2>&1 || { \
    echo "mise is required. Install it first: https://mise.jdx.dev/getting-started.html"; \
    exit 1; \
  }
  mise install

bootstrap-node:
  {{mise_exec}} npm ci --no-fund --no-audit --loglevel=error
  {{mise_exec}} npm ci --prefix my-collection-search --no-fund --no-audit --loglevel=error

bootstrap-python:
  cd ga-service && {{mise_exec}} uv sync --frozen
  cd download-worker && {{mise_exec}} uv sync --frozen
  cd essentia-api && {{mise_exec}} uv sync --frozen

# Install the git pre-commit hook (CI runs the same checks; this is just earlier feedback).
bootstrap-hooks:
  @command -v uv >/dev/null 2>&1 || { \
    echo "uv is required for pre-commit. See https://docs.astral.sh/uv/"; \
    exit 1; \
  }
  uv tool install --quiet pre-commit || true
  uv tool run pre-commit install

# Run every pre-commit hook over the whole repo, as CI does.
lint-all:
  uv tool run pre-commit run --all-files

test: test-web test-packages

test-web:
  {{mise_exec}} npm test --prefix my-collection-search

test-packages:
  {{mise_exec}} npm install --workspace=@groovenet/client
  {{mise_exec}} npm run test --workspace=packages/groovenet-client

lint:
  {{mise_exec}} npm run lint --prefix my-collection-search

typecheck:
  {{mise_exec}} npm run typecheck --prefix my-collection-search
  {{mise_exec}} npm run build --workspace=packages/groovenet-client
  {{mise_exec}} npm run build --workspace=packages/groovenet-cli
  {{mise_exec}} npm run build --workspace=mcp-server

check-compose:
  @if [ -z "{{compose_cmd}}" ]; then \
    echo "Docker Compose is not available."; \
    echo "Install Docker Compose v2 ('docker compose') or docker-compose, then retry."; \
    exit 1; \
  fi

tag:
  @git status --porcelain | grep . >/dev/null && { echo "Working tree not clean. Commit or stash changes first."; exit 1; } || true
  @if git show-ref --tags --quiet {{tag}}; then echo "Tag {{tag}} already exists"; exit 1; fi
  @echo "Creating tag {{tag}}"
  git tag {{tag}}

tag-push: tag
  git push origin {{tag}}

mount-music:
  @if [ -z "{{music_nfs_host}}" ]; then \
    echo "→ MUSIC_NFS_HOST is unset; skipping NFS mount"; \
  elif mount | grep -q '{{music_mount}}'; then \
    echo "→ {{music_mount}} already mounted"; \
  else \
    sudo mkdir -p {{music_mount}}; \
    echo "→ Mounting {{music_nfs_host}}:{{music_nfs_path}} at {{music_mount}}..."; \
    sudo mount -t nfs -o resvport,ro {{music_nfs_host}}:{{music_nfs_path}} {{music_mount}}; \
  fi

unmount-music:
  @if mount | grep -q '{{music_mount}}'; then \
    echo "→ Unmounting {{music_mount}}..."; \
    sudo umount {{music_mount}}; \
  else \
    echo "→ {{music_mount}} not mounted, skipping"; \
  fi

sync-dev-assets:
  @if [ -z "{{asset_sync_host}}" ]; then \
    echo "→ ASSET_SYNC_HOST is unset; skipping asset sync"; \
    exit 0; \
  fi
  BEELINK_HOST={{asset_sync_host}} COVERS_LOCAL_DIR={{album_covers_local_dir}} \
    ./{{app_dir}}/scripts/sync-dev-assets.sh

compose-dev: check-compose mount-music sync-dev-assets
  APP_PORT=${APP_PORT:-3000} {{buildkit_env}} {{op_env}} {{compose_cmd}} -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.worktree.yml {{platform_override}} up --remove-orphans

compose-dev-mac: check-compose mount-music sync-dev-assets
  APP_PORT=${APP_PORT:-3000} {{buildkit_env}} {{op_env}} {{compose_cmd}} -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.worktree.yml -f docker-compose.mac.yml up --remove-orphans

compose-dev-reset: check-compose mount-music
  APP_PORT=${APP_PORT:-3000} {{op_env}} {{compose_cmd}} -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.worktree.yml {{platform_override}} down --remove-orphans
  APP_PORT=${APP_PORT:-3000} {{buildkit_env}} {{op_env}} {{compose_cmd}} -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.worktree.yml {{platform_override}} up --build --force-recreate --remove-orphans

worktree-up *args:
  ./scripts/worktree/setup.sh {{args}}

worktree-down *args:
  ./scripts/worktree/teardown.sh {{args}}

worktree-purge *args:
  ./scripts/worktree/teardown.sh --purge {{args}}

worktree-seed *args:
  ./scripts/worktree/create-golden-seed.sh {{args}}

worktree-install-caddy *args:
  ./scripts/worktree/install-caddy-host.sh {{args}}

compose-prod: check-compose
  {{buildkit_env}} {{op_env}} {{compose_cmd}} -f docker-compose.yml -f docker-compose.prod.yml up

compose-down: check-compose
  {{op_env}} {{compose_cmd}} -f docker-compose.yml -f docker-compose.prod.yml down
  just unmount-music

compose-logs: check-compose
  {{op_env}} {{compose_cmd}} -f docker-compose.yml -f docker-compose.prod.yml logs -f

build-app:
  {{buildkit_env}} docker buildx build --target runner -t {{registry}}/webapp:{{tag}} -f {{app_dir}}/Dockerfile {{app_dir}}

build-essentia:
  {{buildkit_env}} docker buildx build -t {{registry}}/essentia-api:{{tag}} -f essentia-api/Dockerfile essentia-api

build-ga-service:
  {{buildkit_env}} docker buildx build -t {{registry}}/ga-service:{{tag}} -f ga-service/Dockerfile ga-service

build-download-worker:
  {{buildkit_env}} docker buildx build -t {{registry}}/download-worker:{{tag}} -f download-worker/Dockerfile .

rebuild-download-worker: check-compose
  {{op_env}} {{compose_cmd}} -f docker-compose.yml build --no-cache download-worker
  {{op_env}} {{compose_cmd}} -f docker-compose.yml up -d --force-recreate download-worker

rebuild-download-worker-worktree:
  bash --noprofile --norc -c 'source ./scripts/worktree/lib.sh && compose_exec build --no-cache download-worker'
  bash --noprofile --norc -c 'source ./scripts/worktree/lib.sh && compose_exec up -d --force-recreate download-worker'

rebuild-containers services="app essentia ga-service download-worker":
  {{buildkit_env}} {{op_env}} {{compose_cmd}} -f docker-compose.yml build {{services}}

rebuild-containers-no-cache services="app essentia ga-service download-worker":
  {{buildkit_env}} {{op_env}} {{compose_cmd}} -f docker-compose.yml build --no-cache {{services}}

rebuild-up-containers services="app essentia ga-service download-worker":
  {{buildkit_env}} {{op_env}} {{compose_cmd}} -f docker-compose.yml build {{services}}
  {{op_env}} {{compose_cmd}} -f docker-compose.yml up -d {{services}}

build-all: build-app build-essentia build-ga-service build-download-worker

build-packages:
  npm run build --workspace=packages/groovenet-client
  npm run build --workspace=packages/groovenet-cli
  npm run build --workspace=mcp-server

deps-check-app cooldown="14" target="minor":
  cooldown_value="{{cooldown}}"
  target_value="{{target}}"
  {{mise_exec}} npx -y npm-check-updates \
    --packageFile my-collection-search/package.json \
    --target "${target_value#target=}" \
    --cooldown "${cooldown_value#cooldown=}"

deps-update-app cooldown="14" target="minor":
  cooldown_value="{{cooldown}}"
  target_value="{{target}}"
  {{mise_exec}} npx -y npm-check-updates \
    --packageFile my-collection-search/package.json \
    --target "${target_value#target=}" \
    --cooldown "${cooldown_value#cooldown=}" \
    --upgrade
  {{mise_exec}} npm install --prefix my-collection-search

deps-check-python cooldown_days="14":
  #!/usr/bin/env bash
  set -euo pipefail
  cooldown_days_value="{{cooldown_days}}"
  cooldown_days_value="${cooldown_days_value#cooldown_days=}"
  cutoff="$(python3 -c 'from datetime import datetime, timedelta, timezone; print((datetime.now(timezone.utc) - timedelta(days=int("'"$cooldown_days_value"'" ))).date().isoformat())')"
  for service in ga-service essentia-api download-worker; do
    echo "==> $service (excluding releases newer than $cutoff)"
    (
      cd "$service"
      {{mise_exec}} uv lock --upgrade --exclude-newer "$cutoff" --dry-run
    )
  done

deps-update-python cooldown_days="14":
  #!/usr/bin/env bash
  set -euo pipefail
  cooldown_days_value="{{cooldown_days}}"
  cooldown_days_value="${cooldown_days_value#cooldown_days=}"
  cutoff="$(python3 -c 'from datetime import datetime, timedelta, timezone; print((datetime.now(timezone.utc) - timedelta(days=int("'"$cooldown_days_value"'" ))).date().isoformat())')"
  for service in ga-service essentia-api download-worker; do
    echo "==> $service (excluding releases newer than $cutoff)"
    (
      cd "$service"
      {{mise_exec}} uv lock --upgrade --exclude-newer "$cutoff"
      {{mise_exec}} uv sync --frozen
    )
  done

generate-spec:
  {{mise_exec}} npm run openapi:generate-spec --prefix my-collection-search

generate-python-client: generate-spec
  openapi-python-client generate \
    --path openapi-generated.json \
    --output-path packages/groovenet-python \
    --config openapi-python-client.yaml \
    --overwrite

push-images:
  {{buildkit_env}} docker buildx build --platform {{platform}} --target runner --push -t {{registry}}/webapp:{{tag}} -f {{app_dir}}/Dockerfile {{app_dir}}
  {{buildkit_env}} docker buildx build --platform {{platform}} --push -t {{registry}}/essentia-api:{{tag}} -f essentia-api/Dockerfile essentia-api
  {{buildkit_env}} docker buildx build --platform {{platform}} --push -t {{registry}}/ga-service:{{tag}} -f ga-service/Dockerfile ga-service
  {{buildkit_env}} docker buildx build --platform {{platform}} --push -t {{registry}}/download-worker:{{tag}} -f download-worker/Dockerfile .

deploy-prod-local:
  cd {{app_dir}} && ./scripts/deploy-prod.sh {{tag}}

deploy-prod-remote:
  #!/usr/bin/env bash
  set -euo pipefail
  tmp_env="$(mktemp)"
  cleanup() {
    rm -f "$tmp_env"
  }
  trap cleanup EXIT
  if [ -f .env.tpl ] && command -v op >/dev/null 2>&1; then
    bash ./scripts/render-env.sh .env.tpl "$tmp_env"
    scp "$tmp_env" {{prod_host}}:{{prod_stack_dir}}/.env
  fi
  ssh {{prod_host}} 'set -euo pipefail; cd {{prod_stack_dir}}; if [ -x ./my-collection-search/scripts/deploy-prod.sh ]; then ./my-collection-search/scripts/deploy-prod.sh {{tag}}; elif [ -x ./scripts/deploy-prod.sh ]; then ./scripts/deploy-prod.sh {{tag}}; else echo "deploy-prod.sh not found"; exit 127; fi'

# Deploy a published release (vX.Y.Z) to the prod host (pulls images from GHCR).
deploy version:
  #!/usr/bin/env bash
  set -euo pipefail
  if [[ ! "{{version}}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Usage: just deploy v1.2.3   (a published release tag)"
    exit 1
  fi
  TAG="{{version}}" just prod_host="{{prod_host}}" prod_stack_dir="{{prod_stack_dir}}" deploy-prod-remote

# Releases are cut by release-please (merge the Release PR), not from here.
# See RELEASING.md. This recipe no longer tags/builds/deploys in one shot.
release:
  @echo "Releases are automated via release-please — see RELEASING.md:"
  @echo "  1) Land Conventional Commit PRs on main (feat:/fix:/…)"
  @echo "  2) Merge the 'chore(main): release X.Y.Z' PR → tags vX.Y.Z, CI publishes images"
  @echo "  3) Deploy it:  just deploy vX.Y.Z"

deploy-prod-remote-localbuild:
  #!/usr/bin/env bash
  set -euo pipefail
  tmp_env="$(mktemp)"
  cleanup() {
    rm -f "$tmp_env"
  }
  trap cleanup EXIT
  if [ -f .env.tpl ] && command -v op >/dev/null 2>&1; then
    bash ./scripts/render-env.sh .env.tpl "$tmp_env"
    scp "$tmp_env" {{prod_host}}:{{prod_stack_dir}}/.env
  fi
  ssh {{prod_host}} 'set -euo pipefail; cd {{prod_stack_dir}}; if [ -x ./my-collection-search/scripts/deploy-prod-localbuild.sh ]; then ./my-collection-search/scripts/deploy-prod-localbuild.sh {{tag}}; elif [ -x ./scripts/deploy-prod-localbuild.sh ]; then ./scripts/deploy-prod-localbuild.sh {{tag}}; else echo "deploy-prod-localbuild.sh not found"; exit 127; fi'

release-localbuild host="{{prod_host}}" stack_dir="{{prod_stack_dir}}": tag-push
  #!/usr/bin/env bash
  set -euo pipefail
  if [ "{{host}}" = "your-server.example.com" ] || [ -z "{{host}}" ]; then
    echo "Set PROD_HOST or pass an explicit host, e.g. just release-localbuild host=deploy@example.com stack_dir=/opt/stacks/groovenet"
    exit 1
  fi
  TAG="{{tag}}" just prod_host="{{host}}" prod_stack_dir="{{stack_dir}}" deploy-prod-remote-localbuild

deploy-prod-remote-localbuild-vinyl:
  just prod_host="beelink.tail0bdbb0.ts.net" prod_stack_dir="/opt/stacks/dj-playlist" deploy-prod-remote-localbuild

deploy-prod-remote-localbuild-beelink:
  just prod_host="100.117.118.15" prod_stack_dir="/srv/docker/groovenet" deploy-prod-remote-localbuild

release-localbuild-vinyl: tag-push
  TAG="{{tag}}" just prod_host="beelink.tail0bdbb0.ts.net" prod_stack_dir="/opt/stacks/dj-playlist" deploy-prod-remote-localbuild

release-localbuild-beelink: tag-push
  TAG="{{tag}}" just prod_host="100.117.118.15" prod_stack_dir="/srv/docker/groovenet" deploy-prod-remote-localbuild

migrate-up: check-compose
  {{op_env}} {{compose_cmd}} -f docker-compose.yml run --rm migrate

migrate-down: check-compose
  {{op_env}} {{compose_cmd}} -f docker-compose.yml run --rm migrate npx node-pg-migrate down

migrate-create NAME:
  @if [ -z "{{NAME}}" ]; then echo "Usage: just migrate-create <name>"; exit 1; fi
  cd {{app_dir}} && npm run migrate create {{NAME}}

# Verify all migrations apply + roll back + re-apply on a throwaway pgvector db.
migrate-test:
  #!/usr/bin/env bash
  set -euo pipefail
  name="groovenet-migtest-$$"
  port="${MIGRATE_TEST_PORT:-55432}"
  cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
  trap cleanup EXIT
  echo "→ starting throwaway pgvector ($name) on :$port"
  docker run -d --name "$name" \
    -e POSTGRES_USER=djplaylist -e POSTGRES_PASSWORD=test -e POSTGRES_DB=djplaylist \
    -p "$port:5432" pgvector/pgvector:pg15 >/dev/null
  for i in $(seq 1 60); do
    docker exec "$name" pg_isready -U djplaylist -d djplaylist >/dev/null 2>&1 && break
    sleep 1
  done
  DATABASE_URL="postgres://djplaylist:test@localhost:$port/djplaylist" \
    {{mise_exec}} bash ./{{app_dir}}/scripts/migrate-test.sh

# Run the Redis integration tests against a throwaway redis container.
redis-test:
  #!/usr/bin/env bash
  set -euo pipefail
  name="groovenet-redistest-$$"
  port="${REDIS_TEST_PORT:-63799}"
  cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
  trap cleanup EXIT
  echo "→ starting throwaway redis ($name) on :$port"
  docker run -d --name "$name" -p "$port:6379" redis:7-alpine >/dev/null
  for i in $(seq 1 30); do
    docker exec "$name" redis-cli ping >/dev/null 2>&1 && break
    sleep 1
  done
  REDIS_URL="redis://localhost:$port" \
    {{mise_exec}} npm run test:redis --prefix {{app_dir}}

storybook:
  cd {{app_dir}} && npm run storybook

# Build the static Storybook bundle into my-collection-search/storybook-static,
# which is mounted into the app at /app/public/storybook and served same-origin
# at /storybook/ (dev via docker-compose.dev.yml, prod via docker-compose.prod.yml).
build-storybook:
  cd {{app_dir}} && npm run build-storybook

sync-album-covers:
  ./{{app_dir}}/scripts/sync-album-covers.sh \
    "{{album_covers_remote_host}}" \
    "{{album_covers_remote_path}}" \
    "{{album_covers_local_dir}}"
