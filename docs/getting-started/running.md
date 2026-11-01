---
title: Run and update
description: Daily commands and the difference between local, dev and production Compose.
sidebar:
  order: 3
---

```bash
# Follow service logs
docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f

# Stop the stack; your data remains in Docker volumes
docker compose -f docker-compose.yml -f docker-compose.local.yml down

# Update source, rebuild, and restart
git pull
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d
docker compose -f docker-compose.yml -f docker-compose.local.yml run --rm migrate
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

In another terminal, apply the database migrations:

```bash
just migrate-up
```

For the plaintext setup, use `docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.worktree.yml run --rm migrate` instead.

`just compose-dev` combines the base, dev and worktree overrides. It mounts source and the host-built contracts and client packages. Rebuild those packages on the host after changing them. See the [contributor guide](https://github.com/Public-Vinyl-Radio/groovenet/blob/main/CLAUDE.md) for isolated worktree stacks.

`just compose-prod` uses `docker-compose.prod.yml`, the repository's production override. It is distinct from the simple local install. For tagged image deployments and release candidates, follow [RELEASING.md](https://github.com/Public-Vinyl-Radio/groovenet/blob/main/RELEASING.md).

Do not remove Compose volumes to update the app: they hold your collection and audio.
