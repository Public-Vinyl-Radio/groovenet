---
title: Run and update
description: Daily commands and the difference between local, dev and production Compose.
sidebar:
  order: 3
---

## Installed with the script

Run these from the install directory (`/srv/groovenet` or `~/groovenet`); its `.env` already selects the right compose files, so no `-f` flags are needed.

```bash
docker compose logs -f     # follow logs
docker compose down        # stop; your data stays in Docker volumes
curl -fsSL https://groovenet.publicvinylradio.com/install.sh | sh   # upgrade to the latest release
```

The installer rewrites the compose files and `IMAGE_TAG` on each run and leaves your `.env` otherwise alone. `.env.example` beside it is the current template, so `diff .env.example .env` shows settings added since you installed.

The bundled local embedding model runs in Node inside `app`, on CPU. Images
are amd64-only; ARM Macs run them under emulation. No OpenAI key is needed for
suggestions. An OpenAI key is an optional quality upgrade; after adding it to
`.env` and restarting, use the target → backfill → serving cutover documented
in the install guide. YouTube enrichment requires `YOUTUBE_API_KEY` and has no
local fallback.

## Installed from a clone

```bash
# Follow service logs
docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f

# Stop the stack; your data remains in Docker volumes
docker compose -f docker-compose.yml -f docker-compose.local.yml down

# Update source, rebuild, and restart (migrations run automatically)
git pull
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d
```

The local override binds the app to `127.0.0.1:3000`. Set `APP_PORT=3001` in `.env` to use another port. Put GrooveNet behind your own reverse proxy to make it available on a network or public domain.

## Development and production

The install above uses `docker-compose.local.yml`: a source build, a loopback HTTP port and restart policies. It does not use hot reload.

For the hot-reload stack, install [mise](https://mise.jdx.dev/) and [just](https://github.com/casey/just), then run from the repo root:

```bash
mise install
just bootstrap
just compose-dev
```

These `just` Compose recipes use `op run --env-file=.env.tpl` and require the 1Password CLI plus the fields listed in `.env.example`. For a plaintext `.env` instead, replace `just compose-dev` with:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.worktree.yml up --remove-orphans
```

Migrations run automatically on every `up`: a one-shot `migrate` service applies them and the app starts only once it succeeds. To apply or roll back migrations by hand, run `just migrate-up` or `just migrate-down`.

`just compose-dev` combines the base, dev and worktree overrides. It mounts source and the host-built contracts and client packages. Rebuild those packages on the host after changing them. See the [contributor guide](https://github.com/Public-Vinyl-Radio/groovenet/blob/main/CLAUDE.md) for isolated worktree stacks.

`just compose-prod` uses `docker-compose.prod.yml`, the repository's production override. It is distinct from the simple local install. For tagged image deployments and release candidates, follow [RELEASING.md](https://github.com/Public-Vinyl-Radio/groovenet/blob/main/RELEASING.md).

Do not remove Compose volumes to update the app: they hold your collection and audio.

## Optional lossless downloads

`just worktree-up --profile downloads --profile lossless` and
`just worktree-services add downloads lossless` enable the private, locally built
Wrapper v2 1.0.0 sidecar. `all` deliberately excludes it. The image must already
exist; nothing is pulled from a registry and no wrapper port is published.
Read the [owner runbook](https://github.com/Public-Vinyl-Radio/groovenet/blob/main/download-worker/docs/lossless-alac.md) before
building or signing in. With direct Compose, use `COMPOSE_PROFILES=downloads,lossless`
so the worker receives the active profiles, or explicitly set `GAMDL_WRAPPER_URL`.
