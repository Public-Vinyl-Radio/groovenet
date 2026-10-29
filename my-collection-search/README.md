# my-collection-search

Next.js app for browsing, searching, and managing a personal DJ track collection.

## Quick start

1. From the repository root, install the pinned toolchain and dependencies:

```bash
just bootstrap
```

2. Start local services + app (dev):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

3. Run migrations:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate
```

## Compose files

- `docker-compose.yml`: base services/config for all environments
- `docker-compose.dev.yml`: dev overrides (hot reload, source mounts)
- `docker-compose.prod.yml`: production template that extends base services and
  sets the stable Compose project name `groovenet`

Production-style commands should include both files:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm migrate
```

That deployment path creates a stable default network named
`groovenet_default`, which external services like Caddy can join and proxy to
`http://webapp:3000`.

## Useful npm scripts

Run Next.js dev/build through Docker, as required by the repository guide.

- `npm run dev`: start Next.js dev server
- `npm run build`: build production app
- `npm run start`: run production app
- `npm run migrate`: run DB migrations (requires `DATABASE_URL`)
- `npm run test`: run tests
- `npm run lint`: run eslint
- `npm run typecheck`: run TypeScript checks
- `just storybook` (from repo root): separate component dev server on port 6006
- `just build-storybook`: build and verify `public/storybook` for local inspection

App images automatically build, verify and package Storybook, served at
`/storybook/index.html`. Production Compose uses the image bundle without a host
mount; the old `STORYBOOK_STATIC_DIR` override is retired. Set `STORYBOOK_URL`
at runtime for another server. For the hot-reload app, point it at
`http://localhost:6006` and run `just storybook` separately. See the root README's
[Storybook workflow](../README.md#storybook) for configuration and compatibility.

## Key environment variables

- `DATABASE_URL`
- `REDIS_URL`
- Provider credentials (Apple/Discogs/OpenAI) as needed
- `RESTIC_REPOSITORY`, `RESTIC_PASSWORD`, `B2_ACCOUNT_ID`, `B2_ACCOUNT_KEY` (for remote backups)

`DATABASE_URL` is compose-configurable via env and defaults to local docker Postgres when not set.

## Remote Backups (Restic + Backblaze B2)

The app can run scheduled remote backups using policy from `config/backup-policy.yml`.

Required environment variables:

- `RESTIC_REPOSITORY` (B2 format: `b2:<bucket-name>:<path>`)
- `RESTIC_PASSWORD`
- `B2_ACCOUNT_ID`
- `B2_ACCOUNT_KEY`

Example:

```bash
RESTIC_REPOSITORY=b2:groovenet-backups:prod/my-collection-search
RESTIC_PASSWORD=change-this-long-secret
B2_ACCOUNT_ID=0000000000000000000000001
B2_ACCOUNT_KEY=K0000000000000000000000000000000000
```

One-time repository initialization:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec app restic init
```

Optional connectivity check:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec app restic snapshots
```

### Monitoring

`GET /api/health/backup` is intended for an Uptime Kuma HTTP(s) monitor. It returns
`200` after a recent successful backup and `503` when no status exists, a run has
failed, or the last run is older than `BACKUP_HEALTH_MAX_AGE_HOURS` (12 by default).
Set that variable to `30` when using a daily backup schedule. The Settings remote
backup panel shows local selected-source size, Restic repository size, snapshot
count, and recent snapshot runs.

## State ownership

- See [docs/state-ownership.md](docs/state-ownership.md) for canonical ownership:
  - Zustand owns `Track`/`Album` entities
  - React Query owns request lifecycle and lightweight query metadata
- See [docs/frontend-api-pattern.md](docs/frontend-api-pattern.md) for the frontend API contract/internal API pattern.

## OpenAPI and Swagger docs

- Swagger UI: `http://localhost:3000/api/docs`
- Raw OpenAPI JSON: `http://localhost:3000/api/openapi.json`

Validate generation:

```bash
npm run openapi:check
```

Contract sources:

- `src/api-contract/schemas.ts`
- `src/api-contract/routes.ts`
- `src/api-contract/openapi.ts`
