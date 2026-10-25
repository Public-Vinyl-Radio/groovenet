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
  {{mise_exec}} node scripts/check-npm-toolchain.mjs
  {{mise_exec}} npm ci --no-fund --no-audit --loglevel=error
  {{mise_exec}} npm run build --workspace=@groovenet/contracts
  {{mise_exec}} npm ci --prefix my-collection-search --no-fund --no-audit --loglevel=error

bootstrap-python:
  cd ga-service && {{mise_exec}} uv sync --frozen
  cd download-worker && {{mise_exec}} uv sync --frozen
  cd essentia-api && {{mise_exec}} uv sync --frozen
  cd fingerprint-service && {{mise_exec}} uv sync --frozen
  cd packages/groovenet-python && {{mise_exec}} uv sync --frozen

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
  {{mise_exec}} node scripts/check-npm-toolchain.mjs
  {{mise_exec}} npm ci --no-fund --no-audit
  {{mise_exec}} node --test scripts/npm-toolchain.test.mjs
  {{mise_exec}} npm run build --workspace=@groovenet/contracts
  {{mise_exec}} npm run test:coverage --workspace=@groovenet/contracts
  {{mise_exec}} npm run test --workspace=packages/groovenet-client
  # The CLI imports @groovenet/client by its build output, so build it first.
  {{mise_exec}} npm run build --workspace=packages/groovenet-client
  {{mise_exec}} npm run build --workspace=packages/groovenet-player
  {{mise_exec}} npm run test --workspace=packages/groovenet-player
  {{mise_exec}} npm run test --workspace=packages/groovenet-cli
  {{mise_exec}} npm run test --workspace=mcp-server

lint:
  {{mise_exec}} npm run lint --prefix my-collection-search
  {{mise_exec}} npm run lint --workspace=@groovenet/contracts
  {{mise_exec}} npm run lint --workspace=@groovenet/client
  {{mise_exec}} npm run lint --workspace=@groovenet/player
  {{mise_exec}} npm run lint --workspace=@groovenet/cli
  {{mise_exec}} npm run lint --workspace=mcp-server

typecheck:
  {{mise_exec}} npm run build --workspace=@groovenet/contracts
  {{mise_exec}} npm run typecheck --prefix my-collection-search
  {{mise_exec}} npm run build --workspace=packages/groovenet-client
  {{mise_exec}} npm run build --workspace=packages/groovenet-player
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

# Golden seed from PRODUCTION (read-only): db dump + album covers over SSH. Needs PROD_SEED_HOST or --host user@host.
worktree-seed-prod *args:
  ./scripts/worktree/create-prod-seed.sh {{args}}

# Park an epic: label it and its sub-issues `parked` (hide with -label:parked on GitHub).
epic-park epic:
  ./scripts/epic-park.sh park {{epic}}

# Unpark an epic and its sub-issues.
epic-unpark epic:
  ./scripts/epic-park.sh unpark {{epic}}

worktree-install-caddy *args:
  ./scripts/worktree/install-caddy-host.sh {{args}}

# Clean up compose stacks and Caddy fragments left behind by deleted worktrees. Dry run by default; pass --apply to remove them.
worktree-gc *args:
  ./scripts/worktree/gc.sh {{args}}

# Launch or attach to the herdr session for this repo (https://herdr.dev)
herdr:
  @command -v herdr >/dev/null 2>&1 || { echo "herdr is not installed: https://herdr.dev"; exit 1; }
  @if [[ "${HERDR_ENV:-}" == 1 ]]; then echo "Already inside herdr; use 'just herdr-task <branch>' for a new task."; exit 1; fi
  herdr --session "${HERDR_SESSION:-groovenet}"

# New task in herdr: worktree + workspace for <branch>, bootstrapped, with its own compose stack.
# [positional-arguments] keeps each arg as its own shell word (e.g. --prompt "multi word text"),
# since plain {{args}} interpolation would re-split it on whitespace.
[positional-arguments]
herdr-task branch *args:
  ./scripts/worktree/herdr-task.sh "$1" "${@:2}"

# Finish a herdr worktree task: tear down its stack, then remove the herdr workspace. Run from a pane inside that workspace.
herdr-done *args:
  ./scripts/worktree/herdr-done.sh {{args}}

compose-prod: check-compose
  {{buildkit_env}} {{op_env}} {{compose_cmd}} -f docker-compose.yml -f docker-compose.prod.yml up

compose-down: check-compose
  {{op_env}} {{compose_cmd}} -f docker-compose.yml -f docker-compose.prod.yml down
  just unmount-music

compose-logs: check-compose
  {{op_env}} {{compose_cmd}} -f docker-compose.yml -f docker-compose.prod.yml logs -f

build-app:
  {{buildkit_env}} docker buildx build --target runner -t {{registry}}/webapp:{{tag}} -f {{app_dir}}/Dockerfile .

build-essentia:
  {{buildkit_env}} docker buildx build -t {{registry}}/essentia-api:{{tag}} -f essentia-api/Dockerfile essentia-api

build-ga-service:
  {{buildkit_env}} docker buildx build -t {{registry}}/ga-service:{{tag}} -f ga-service/Dockerfile ga-service

build-download-worker:
  {{buildkit_env}} docker buildx build -t {{registry}}/download-worker:{{tag}} -f download-worker/Dockerfile .

build-fingerprint-service:
  {{buildkit_env}} docker buildx build -t {{registry}}/fingerprint-service:{{tag}} -f fingerprint-service/Dockerfile .

rebuild-download-worker: check-compose
  {{op_env}} {{compose_cmd}} -f docker-compose.yml build --no-cache download-worker
  {{op_env}} {{compose_cmd}} -f docker-compose.yml up -d --force-recreate download-worker

rebuild-download-worker-worktree:
  bash --noprofile --norc -c 'source ./scripts/worktree/lib.sh && compose_exec build --no-cache download-worker'
  bash --noprofile --norc -c 'source ./scripts/worktree/lib.sh && compose_exec up -d --force-recreate download-worker'

rebuild-containers services="app essentia ga-service download-worker fingerprint-service fingerprint-set-worker":
  {{buildkit_env}} {{op_env}} {{compose_cmd}} -f docker-compose.yml build {{services}}

rebuild-containers-no-cache services="app essentia ga-service download-worker fingerprint-service fingerprint-set-worker":
  {{buildkit_env}} {{op_env}} {{compose_cmd}} -f docker-compose.yml build --no-cache {{services}}

rebuild-up-containers services="app essentia ga-service download-worker fingerprint-service fingerprint-set-worker":
  {{buildkit_env}} {{op_env}} {{compose_cmd}} -f docker-compose.yml build {{services}}
  {{op_env}} {{compose_cmd}} -f docker-compose.yml up -d {{services}}

build-all: build-app build-essentia build-ga-service build-download-worker build-fingerprint-service

build-packages:
  {{mise_exec}} npm run build --workspace=packages/groovenet-contracts
  {{mise_exec}} npm run build --workspace=packages/groovenet-client
  {{mise_exec}} npm run build --workspace=packages/groovenet-player
  {{mise_exec}} npm run build --workspace=packages/groovenet-cli
  {{mise_exec}} npm run build --workspace=mcp-server

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
  for service in ga-service essentia-api download-worker fingerprint-service; do
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
  for service in ga-service essentia-api download-worker fingerprint-service; do
    echo "==> $service (excluding releases newer than $cutoff)"
    (
      cd "$service"
      {{mise_exec}} uv lock --upgrade --exclude-newer "$cutoff"
      {{mise_exec}} uv sync --frozen
    )
  done

test-python-client: generate-spec
  cd packages/groovenet-python && GROOVENET_REQUIRE_OPENAPI=1 {{mise_exec}} uv run --locked --group dev pytest --cov=groovenet_client --cov-branch --cov-report=term-missing

generate-spec:
  {{mise_exec}} npm run openapi:generate-spec --prefix my-collection-search

push-images:
  {{buildkit_env}} docker buildx build --platform {{platform}} --target runner --push -t {{registry}}/webapp:{{tag}} -f {{app_dir}}/Dockerfile .
  {{buildkit_env}} docker buildx build --platform {{platform}} --push -t {{registry}}/essentia-api:{{tag}} -f essentia-api/Dockerfile essentia-api
  {{buildkit_env}} docker buildx build --platform {{platform}} --push -t {{registry}}/ga-service:{{tag}} -f ga-service/Dockerfile ga-service
  {{buildkit_env}} docker buildx build --platform {{platform}} --push -t {{registry}}/download-worker:{{tag}} -f download-worker/Dockerfile .
  {{buildkit_env}} docker buildx build --platform {{platform}} --push -t {{registry}}/fingerprint-service:{{tag}} -f fingerprint-service/Dockerfile .

deploy-prod-local:
  cd {{app_dir}} && ./scripts/deploy-prod.sh {{tag}}

deploy-prod-remote:
  #!/usr/bin/env bash
  set -euo pipefail
  tmp_env="$(mktemp)"
  tmp_player_env="$(mktemp)"
  cleanup() {
    rm -f "$tmp_env" "$tmp_player_env"
  }
  trap cleanup EXIT
  if [ -f .env.tpl ] && command -v op >/dev/null 2>&1; then
    bash ./scripts/render-env.sh .env.tpl "$tmp_env"
    scp "$tmp_env" {{prod_host}}:{{prod_stack_dir}}/.env
  fi
  # Existing .env.players is the host opt-in. Refresh its 1Password values
  # separately so rendering the collection .env never erases player settings.
  if [ -f .env.players.tpl ] && command -v op >/dev/null 2>&1; then
    if ssh {{prod_host}} "test -f {{prod_stack_dir}}/.env.players"; then
      op run --env-file .env.players.tpl -- node my-collection-search/scripts/render-player-env.mjs "$tmp_player_env"
      scp "$tmp_player_env" {{prod_host}}:{{prod_stack_dir}}/.env.players
      ssh {{prod_host}} "chmod 600 {{prod_stack_dir}}/.env.players"
    fi
  fi
  # Check out what is being deployed *before* running its deploy script, so
  # the script that runs is the one from that commit — not whatever the box
  # last checked out, which may predate what this release needs (e.g. an old
  # script that cannot deploy a sha- candidate).
  #
  # A release candidate's image tag, sha-<short>, is not a git ref. Its commit
  # is checked out, and a matching tag is made in the box's clone — local only,
  # never pushed — because deploy-prod.sh checks out its argument, and scripts
  # from before it learned to map sha- tags would otherwise fail on it.
  git_ref="{{tag}}"
  tag_rc=""
  if [[ "$git_ref" =~ ^sha-([0-9a-f]{7,40})$ ]]; then
    git_ref="${BASH_REMATCH[1]}"
    tag_rc="git tag -f {{tag}} ${git_ref} >/dev/null;"
  fi
  ssh {{prod_host}} "set -euo pipefail; cd {{prod_stack_dir}}; git fetch --quiet --tags; git checkout --quiet ${git_ref}; ${tag_rc} if [ -x ./my-collection-search/scripts/deploy-prod.sh ]; then ./my-collection-search/scripts/deploy-prod.sh {{tag}}; elif [ -x ./scripts/deploy-prod.sh ]; then ./scripts/deploy-prod.sh {{tag}}; else echo 'deploy-prod.sh not found'; exit 127; fi"

# Pulls images from GHCR. A release candidate is the tested set CI builds for
# every main commit, tagged sha-<7 hex> — see `deploy-rc`.
# Deploy a release (vX.Y.Z) or a release candidate (sha-abc1234) to the prod host.
deploy version:
  #!/usr/bin/env bash
  set -euo pipefail
  if [[ "{{version}}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    :
  elif [[ "{{version}}" =~ ^sha-[0-9a-f]{7}$ ]]; then
    # A release's images were all promoted together; a candidate's are only
    # as complete as its CI run. Refuse a half-built set rather than deploy
    # new images for some services and fail to pull the rest.
    just registry="{{registry}}" check-images "{{version}}"
  else
    echo "Usage: just deploy v1.2.3        (a published release)"
    echo "       just deploy sha-abc1234   (a release candidate; see just deploy-rc)"
    exit 1
  fi
  TAG="{{version}}" just prod_host="{{prod_host}}" prod_stack_dir="{{prod_stack_dir}}" deploy-prod-remote

# The images are the ones a release later promotes unchanged, so what you test
# is what ships. Defaults to the tip of origin/main.
# Deploy a main commit's tested images as a release candidate, before releasing.
deploy-rc commit="origin/main":
  #!/usr/bin/env bash
  set -euo pipefail
  git fetch --quiet --tags origin main
  full="$(git rev-parse --verify --quiet "{{commit}}^{commit}")" || {
    echo "Unknown commit: {{commit}}"; exit 1;
  }
  # CI only builds images for commits pushed to main.
  if ! git merge-base --is-ancestor "$full" origin/main; then
    echo "{{commit}} is not on origin/main, so CI never built images for it."
    exit 1
  fi
  image_tag="sha-${full:0:7}"
  last="$(git describe --tags --abbrev=0 --match 'v[0-9]*.[0-9]*.[0-9]*' "$full" 2>/dev/null || true)"
  echo "Release candidate ${image_tag}: $(git log -1 --format=%s "$full")"
  if [[ -n "$last" ]]; then
    echo "Changes since ${last}:"
    git log --format='  %h %s' "${last}..${full}"
  fi
  echo
  just registry="{{registry}}" prod_host="{{prod_host}}" prod_stack_dir="{{prod_stack_dir}}" deploy "$image_tag"

# Keep the list in step with SERVICES in deploy-prod.sh and `promote` in
# docker-publish.yml (fingerprint-set-worker runs the fingerprint-service image).
# Check that every service has an image in GHCR under this tag.
check-images image_tag:
  #!/usr/bin/env bash
  set -euo pipefail
  missing=()
  for svc in webapp webapp-migrate essentia-api ga-service download-worker fingerprint-service; do
    if docker manifest inspect "{{registry}}/${svc}:{{image_tag}}" >/dev/null 2>&1; then
      echo "  ✓ ${svc}:{{image_tag}}"
    else
      echo "  ✗ ${svc}:{{image_tag}}"
      missing+=("$svc")
    fi
  done
  if (( ${#missing[@]} )); then
    echo "Missing ${#missing[@]} image(s) for {{image_tag}}. Is its CI run finished and green?"
    exit 1
  fi

# Releases are cut by release-please (merge the Release PR), not from here.
# See RELEASING.md. This recipe no longer tags/builds/deploys in one shot.
release:
  @echo "Releases are automated via release-please — see RELEASING.md:"
  @echo "  1) Land Conventional Commit PRs on main (feat:/fix:/…)"
  @echo "  2) Merge the 'chore(main): release X.Y.Z' PR → tags vX.Y.Z, CI publishes images"
  @echo "  3) Deploy it:  just deploy vX.Y.Z"
  @echo "  To test main on the box first:  just deploy-rc"

migrate-up: check-compose
  {{op_env}} {{compose_cmd}} -f docker-compose.yml run --rm migrate

migrate-down: check-compose
  {{op_env}} {{compose_cmd}} -f docker-compose.yml run --rm migrate npx node-pg-migrate down

migrate-create NAME:
  @if [ -z "{{NAME}}" ]; then echo "Usage: just migrate-create <name>"; exit 1; fi
  cd {{app_dir}} && npm run migrate create {{NAME}}

# Build the one-off maintenance-scripts image (src/scripts/*.ts, e.g.
# backfill-key-confidence, #524). Not built by `up` or CI — on demand only,
# here or on the deploy host (there, run the underlying `docker compose
# build scripts` directly; op/.env.tpl are a local-dev convenience, and the
# host already has a materialized .env).
scripts-build: check-compose
  {{op_env}} {{compose_cmd}} -f docker-compose.yml build scripts

# Run a one-off maintenance script in a throwaway container, e.g.:
#   just scripts-run npm run backfill-key-confidence -- --limit=5
scripts-run *args: check-compose
  {{op_env}} {{compose_cmd}} -f docker-compose.yml run --rm scripts {{args}}

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
  # Probe over TCP. On first start the image runs initdb against a temporary
  # server that listens on the socket only, then restarts; a socket probe can
  # pass in that window and the first client gets "Connection terminated
  # unexpectedly". The same applies to every *-test recipe below.
  for i in $(seq 1 60); do
    docker exec "$name" pg_isready -h 127.0.0.1 -U djplaylist -d djplaylist >/dev/null 2>&1 && break
    sleep 1
  done
  DATABASE_URL="postgres://djplaylist:test@localhost:$port/djplaylist" \
    {{mise_exec}} bash ./{{app_dir}}/scripts/migrate-test.sh

# Verify genre seed replay and taxonomy admin mutations against real Postgres.
genres-test:
  #!/usr/bin/env bash
  set -euo pipefail
  name="groovenet-genrestest-$$"
  port="${GENRES_TEST_PORT:-55439}"
  cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
  trap cleanup EXIT
  docker run -d --name "$name" --tmpfs /var/lib/postgresql/data \
    -e POSTGRES_USER=djplaylist -e POSTGRES_PASSWORD=test -e POSTGRES_DB=djplaylist \
    -p "$port:5432" pgvector/pgvector:pg15 >/dev/null
  for i in $(seq 1 60); do
    docker exec "$name" pg_isready -h 127.0.0.1 -U djplaylist -d djplaylist >/dev/null 2>&1 && break
    sleep 1
  done
  export DATABASE_URL="postgres://djplaylist:test@localhost:$port/djplaylist"
  {{mise_exec}} npm run migrate --prefix {{app_dir}} -- up
  RUN_DB_TESTS=1 {{mise_exec}} npm test --prefix {{app_dir}} -- --no-file-parallelism src/server/services/__tests__/genreAdminService.integration.test.ts src/server/repositories/__tests__/trackGenreRepository.integration.test.ts src/server/services/__tests__/genreReconciliation.integration.test.ts src/server/genres/genreFilter.integration.test.ts src/server/services/__tests__/genreSimilarity.integration.test.ts src/server/services/__tests__/genrePage.integration.test.ts src/server/genres/albumOverrides.integration.test.ts

# Run the fingerprint schema integration tests against a throwaway pgvector db.
fingerprint-test:
  #!/usr/bin/env bash
  set -euo pipefail
  name="groovenet-fptest-$$"
  port="${FINGERPRINT_TEST_PORT:-55433}"
  cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
  trap cleanup EXIT
  echo "→ starting throwaway pgvector ($name) on :$port"
  docker run -d --name "$name" \
    -e POSTGRES_USER=djplaylist -e POSTGRES_PASSWORD=test -e POSTGRES_DB=djplaylist \
    -p "$port:5432" pgvector/pgvector:pg15 >/dev/null
  for i in $(seq 1 60); do
    docker exec "$name" pg_isready -h 127.0.0.1 -U djplaylist -d djplaylist >/dev/null 2>&1 && break
    sleep 1
  done
  export DATABASE_URL="postgres://djplaylist:test@localhost:$port/djplaylist"
  {{mise_exec}} npm run migrate --prefix {{app_dir}} -- up
  {{mise_exec}} npm run test:fingerprints --prefix {{app_dir}}

# Browser tests for the floating player (Playwright, #484) against this worktree's running dev stack.
# Needs `just worktree-up` first; set E2E_BASE_URL to target another app. Installs Chromium on first use.
player-e2e *args:
  #!/usr/bin/env bash
  set -euo pipefail
  if [[ -z "${E2E_BASE_URL:-}" ]]; then
    env_file="$(ls .worktree/*.env 2>/dev/null | head -n1 || true)"
    port="$( [[ -n "$env_file" ]] && sed -n 's/^APP_PORT=//p' "$env_file" || true )"
    export E2E_BASE_URL="http://127.0.0.1:${port:-3000}"
  fi
  echo "→ player e2e against $E2E_BASE_URL"
  curl -fsS -o /dev/null "$E2E_BASE_URL/settings" || { echo "app not reachable at $E2E_BASE_URL (is the dev stack up?)"; exit 1; }
  {{mise_exec}} npx --prefix {{app_dir}} playwright install chromium
  RUN_E2E_TESTS=1 {{mise_exec}} npm run test:e2e --prefix {{app_dir}} -- {{args}}

# Run the audio ingest schema integration tests against a throwaway pgvector db.
ingest-test:
  #!/usr/bin/env bash
  set -euo pipefail
  name="groovenet-ingesttest-$$"
  port="${INGEST_TEST_PORT:-55434}"
  cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
  trap cleanup EXIT
  echo "→ starting throwaway pgvector ($name) on :$port"
  docker run -d --name "$name" \
    -e POSTGRES_USER=djplaylist -e POSTGRES_PASSWORD=test -e POSTGRES_DB=djplaylist \
    -p "$port:5432" pgvector/pgvector:pg15 >/dev/null
  for i in $(seq 1 60); do
    docker exec "$name" pg_isready -h 127.0.0.1 -U djplaylist -d djplaylist >/dev/null 2>&1 && break
    sleep 1
  done
  export DATABASE_URL="postgres://djplaylist:test@localhost:$port/djplaylist"
  {{mise_exec}} npm run migrate --prefix {{app_dir}} -- up
  {{mise_exec}} npm run test:ingest --prefix {{app_dir}}

# Run the set derivation queries (#282) against a throwaway pgvector db.
set-derivation-test:
  #!/usr/bin/env bash
  set -euo pipefail
  name="groovenet-settest-$$"
  port="${SET_DERIVATION_TEST_PORT:-55436}"
  cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
  trap cleanup EXIT
  echo "→ starting throwaway pgvector ($name) on :$port"
  docker run -d --name "$name" \
    -e POSTGRES_USER=djplaylist -e POSTGRES_PASSWORD=test -e POSTGRES_DB=djplaylist \
    -p "$port:5432" pgvector/pgvector:pg15 >/dev/null
  for i in $(seq 1 60); do
    docker exec "$name" pg_isready -h 127.0.0.1 -U djplaylist -d djplaylist >/dev/null 2>&1 && break
    sleep 1
  done
  export DATABASE_URL="postgres://djplaylist:test@localhost:$port/djplaylist"
  {{mise_exec}} npm run migrate --prefix {{app_dir}} -- up
  {{mise_exec}} npm run test:set-derivations --prefix {{app_dir}}

# Run the debug read queries against a throwaway pgvector db.
debug-reads-test:
  #!/usr/bin/env bash
  set -euo pipefail
  name="groovenet-debugtest-$$"
  port="${DEBUG_TEST_PORT:-55435}"
  cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
  trap cleanup EXIT
  echo "→ starting throwaway pgvector ($name) on :$port"
  docker run -d --name "$name" \
    -e POSTGRES_USER=djplaylist -e POSTGRES_PASSWORD=test -e POSTGRES_DB=djplaylist \
    -p "$port:5432" pgvector/pgvector:pg15 >/dev/null
  for i in $(seq 1 60); do
    docker exec "$name" pg_isready -h 127.0.0.1 -U djplaylist -d djplaylist >/dev/null 2>&1 && break
    sleep 1
  done
  export DATABASE_URL="postgres://djplaylist:test@localhost:$port/djplaylist"
  {{mise_exec}} npm run migrate --prefix {{app_dir}} -- up
  {{mise_exec}} npm run test:debug-reads --prefix {{app_dir}}

# Run the template-versioned embedding queries (#407) and context retrieval (#408) against a throwaway pgvector db.
embedding-versions-test:
  #!/usr/bin/env bash
  set -euo pipefail
  name="groovenet-embverstest-$$"
  port="${EMBEDDING_VERSIONS_TEST_PORT:-55440}"
  cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
  trap cleanup EXIT
  echo "→ starting throwaway pgvector ($name) on :$port"
  docker run -d --name "$name" \
    -e POSTGRES_USER=djplaylist -e POSTGRES_PASSWORD=test -e POSTGRES_DB=djplaylist \
    -p "$port:5432" pgvector/pgvector:pg15 >/dev/null
  for i in $(seq 1 60); do
    docker exec "$name" pg_isready -h 127.0.0.1 -U djplaylist -d djplaylist >/dev/null 2>&1 && break
    sleep 1
  done
  export DATABASE_URL="postgres://djplaylist:test@localhost:$port/djplaylist"
  {{mise_exec}} npm run migrate --prefix {{app_dir}} -- up
  {{mise_exec}} npm run test:embedding-versions --prefix {{app_dir}}

# Run the play detection schema and retention tests against a throwaway pgvector db.
play-detections-test:
  #!/usr/bin/env bash
  set -euo pipefail
  name="groovenet-detecttest-$$"
  port="${PLAY_DETECTIONS_TEST_PORT:-55438}"
  cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
  trap cleanup EXIT
  echo "→ starting throwaway pgvector ($name) on :$port"
  docker run -d --name "$name" \
    -e POSTGRES_USER=djplaylist -e POSTGRES_PASSWORD=test -e POSTGRES_DB=djplaylist \
    -p "$port:5432" pgvector/pgvector:pg15 >/dev/null
  for i in $(seq 1 60); do
    docker exec "$name" pg_isready -h 127.0.0.1 -U djplaylist -d djplaylist >/dev/null 2>&1 && break
    sleep 1
  done
  export DATABASE_URL="postgres://djplaylist:test@localhost:$port/djplaylist"
  {{mise_exec}} npm run migrate --prefix {{app_dir}} -- up
  {{mise_exec}} npm run test:play-detections --prefix {{app_dir}}

# Run the spin list and edit queries against a throwaway pgvector db.
spin-sessions-test:
  #!/usr/bin/env bash
  set -euo pipefail
  name="groovenet-spintest-$$"
  port="${SPIN_SESSIONS_TEST_PORT:-55437}"
  cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
  trap cleanup EXIT
  echo "→ starting throwaway pgvector ($name) on :$port"
  docker run -d --name "$name" \
    -e POSTGRES_USER=djplaylist -e POSTGRES_PASSWORD=test -e POSTGRES_DB=djplaylist \
    -p "$port:5432" pgvector/pgvector:pg15 >/dev/null
  for i in $(seq 1 60); do
    docker exec "$name" pg_isready -h 127.0.0.1 -U djplaylist -d djplaylist >/dev/null 2>&1 && break
    sleep 1
  done
  export DATABASE_URL="postgres://djplaylist:test@localhost:$port/djplaylist"
  {{mise_exec}} npm run migrate --prefix {{app_dir}} -- up
  {{mise_exec}} npm run test:spin-sessions --prefix {{app_dir}}

# Run the record copy and care queries against a throwaway pgvector db.
record-care-test:
  #!/usr/bin/env bash
  set -euo pipefail
  name="groovenet-recordcaretest-$$"
  port="${RECORD_CARE_TEST_PORT:-55439}"
  cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
  trap cleanup EXIT
  echo "→ starting throwaway pgvector ($name) on :$port"
  docker run -d --name "$name" \
    -e POSTGRES_USER=djplaylist -e POSTGRES_PASSWORD=test -e POSTGRES_DB=djplaylist \
    -p "$port:5432" pgvector/pgvector:pg15 >/dev/null
  for i in $(seq 1 60); do
    docker exec "$name" pg_isready -h 127.0.0.1 -U djplaylist -d djplaylist >/dev/null 2>&1 && break
    sleep 1
  done
  export DATABASE_URL="postgres://djplaylist:test@localhost:$port/djplaylist"
  {{mise_exec}} npm run migrate --prefix {{app_dir}} -- up
  {{mise_exec}} npm run test:record-care --prefix {{app_dir}}

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

# Standalone hot-reload UI catalogue; does not start the Compose app/services.
storybook:
  {{mise_exec}} npm run storybook --prefix {{app_dir}}

# Build and verify my-collection-search/public/storybook for local inspection.
# Images run this automatically; production never uses a host Storybook mount.
build-storybook:
  {{mise_exec}} npm run build-storybook --prefix {{app_dir}}

sync-album-covers:
  ./{{app_dir}}/scripts/sync-album-covers.sh \
    "{{album_covers_remote_host}}" \
    "{{album_covers_remote_path}}" \
    "{{album_covers_local_dir}}"

# Silent Docker deployment and two-engine lifecycle regressions (no speakers).
server-players-smoke:
  {{buildkit_env}} docker build -t groovenet-owntone:693-test packages/groovenet-player/owntone
  {{buildkit_env}} docker build -t groovenet-player-server:693-test -f packages/groovenet-player/server/Dockerfile .
  {{mise_exec}} node evaluations/693/deployment-smoke.mjs
  {{mise_exec}} node evaluations/693/isolated-smoke.mjs

# Persistent server-player SQL, against an isolated migrated Postgres.
server-players-test:
  #!/usr/bin/env bash
  set -euo pipefail
  name="groovenet-players-test-$$"
  port="${PLAYER_TEST_PORT:-55594}"
  cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
  trap cleanup EXIT
  docker run -d --name "$name" --tmpfs /var/lib/postgresql/data \
    -e POSTGRES_USER=djplaylist -e POSTGRES_PASSWORD=test -e POSTGRES_DB=djplaylist \
    -p "$port:5432" pgvector/pgvector:pg15 >/dev/null
  for i in $(seq 1 60); do
    docker exec "$name" pg_isready -h 127.0.0.1 -U djplaylist -d djplaylist >/dev/null 2>&1 && break
    sleep 1
  done
  export DATABASE_URL="postgres://djplaylist:test@localhost:$port/djplaylist"
  {{mise_exec}} npm run migrate --prefix {{app_dir}} -- up
  RUN_PLAYER_DB_TESTS=1 {{mise_exec}} npm test --workspace @groovenet/player -- --run src/server/store.integration.test.ts
