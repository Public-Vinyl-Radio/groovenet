# Groovenet — agent guide

Vinyl collection manager for DJs: a Next.js app over Postgres, with Python
services for audio analysis, downloads and playlist optimisation.

`AGENTS.md` is a symlink to this file, so Codex and Claude Code read the same
guidance. Each service has its own `CLAUDE.md` with the detail for that service;
Claude Code loads those automatically when you work in the directory. Start
there rather than expanding this file.

| Service | Directory | Detail |
| --- | --- | --- |
| Next.js app + API | `my-collection-search/` | [CLAUDE.md](my-collection-search/CLAUDE.md) |
| Download worker | `download-worker/` | [CLAUDE.md](download-worker/CLAUDE.md) |
| Audio analysis | `essentia-api/` | [CLAUDE.md](essentia-api/CLAUDE.md) |
| Playlist optimiser | `ga-service/` | [CLAUDE.md](ga-service/CLAUDE.md) |
| Fingerprint matcher | `fingerprint-service/` | [CLAUDE.md](fingerprint-service/CLAUDE.md) |
| MCP server | `mcp-server/` | [CLAUDE.md](mcp-server/CLAUDE.md) |
| Typed API client | `packages/groovenet-client/` | [CLAUDE.md](packages/groovenet-client/CLAUDE.md) |
| CLI | `packages/groovenet-cli/` | [CLAUDE.md](packages/groovenet-cli/CLAUDE.md) |
| Generated Python client | `packages/groovenet-python/` | generated — never hand-edit |

## Architecture

```
                    ┌──────────────────────────┐
                    │  Next.js app  :3000      │
                    │  UI + REST API           │
                    └───┬───────┬──────┬───────┘
                        │       │      │
         ┌──────────────┘       │      └────────────┐
         ▼                      ▼                   ▼
   ┌───────────┐          ┌──────────┐      ┌──────────────┐
   │ Postgres  │          │  Redis   │      │ ga-service   │
   │ + pgvector│          │  queues  │      │   :8002      │
   │   :5432   │          │  :6379   │      │ /optimize    │
   └───────────┘          └──┬────┬──┘      └──────────────┘
         ▲                   │    │
         │    download_queue │    │ fingerprint_queue
         │                   ▼    ▼
         │   ┌──────────────────┐ ┌─────────────────────┐
         ├───┤ download-worker  │ │ fingerprint-service │
         │   │  (no HTTP port)  │ │   (no HTTP port)    │
         │   └────────┬─────────┘ └─────────────────────┘
         │ via API    │
         │            ▼
         │   ┌──────────────┐
         └───┤ essentia-api │
             │    :8001     │
             │  /analyze    │
             └──────────────┘
```

Postgres is the only datastore. Search is Postgres full-text + trigram, and
similarity is pgvector — there is no separate search service.

`docker-compose.yml` defines: `app`, `migrate`, `db`, `essentia`, `ga-service`,
`redis`, `download-worker`, `fingerprint-service`.

## Data flow

**Import** — Discogs API → parse → Postgres → visible in the app.

**Download and analyse** — the app pushes a job onto the Redis list
`download_queue`; `download-worker` pops it, downloads with gamdl or yt-dlp,
writes to the shared `/audio` volume, calls essentia-api for BPM/key/mood, then
writes results back through the app's REST API.

**Playlist optimisation** — the app posts the selected tracks to ga-service
`/optimize`, which returns an ordering tuned for BPM and key transitions.

**Vinyl play tracking** — a listener posts audio chunks to the app, which writes
them to the shared `audio_ingest` volume and pushes a job onto the Redis list
`fingerprint_queue`; `fingerprint-service` pops it, decodes to mono PCM, matches
against the reference fingerprint index, and reports back over REST. Epic #281;
the matcher itself is still stubbed. The app sweeps that volume on a timer —
raw audio is discarded once its `audio_ingests` row is terminal, and a file
being written or decoded right now is never touched.

**Reference indexing** — that match needs an index to search, built ahead of
time by `groovenet fingerprint-library`. The app resolves the scope to tracks
with a `local_audio_url` and queues one job per track on `fingerprint_index_queue`;
`fingerprint-service` hashes each file, skips it when the stored `audio_sha256`
still matches, and otherwise fingerprints it and persists the result through the
app's REST API. Idempotent by design — a second run does no work.

## Working on this repo

`just --list` is the command surface; prefer it over raw `docker compose`.

```bash
just bootstrap        # deps + pre-commit hook
just compose-dev      # hot-reload stack
just migrate-up       # apply migrations
just test             # web + packages
just lint-all         # every pre-commit hook, as CI runs them
```

Pre-commit runs file hygiene, ruff over the Python services, and ESLint over
the web app. CI runs the same hooks, so `--no-verify` only defers the failure.

## Conventions

- **Conventional Commits**, squash-merged. The PR title becomes the commit, and
  release-please reads it — so the title matters more than the branch.
- **Postgres is the source of truth.** Schema changes need a migration in
  `my-collection-search/migrations/`; verify with `just migrate-test`.
- **Track types live in `my-collection-search/src/types/track.ts`.** Other
  packages copy from there; keep them in step.
- **Build order for the packages:** client → cli → mcp-server
  (`just build-packages`).
- **Integration tests are gated** behind `RUN_*_TESTS` env vars and run against
  throwaway containers (`just migrate-test`, `just redis-test`,
  `just fingerprint-test`, `just ingest-test`). Use them when bumping
  dependencies, and when the SQL is something a mocked driver would accept but a
  real one would not.
- **New env vars** go in the repo-root `.env.example`, which is the file
  `docker-compose.yml` reads.

## Releases

Automated via release-please — see `RELEASING.md`.

1. Land Conventional Commit PRs on `main`.
2. release-please opens a Release PR bumping the version and `CHANGELOG.md`.
3. Merging it tags `vX.Y.Z`, and `docker-publish.yml` publishes
   `ghcr.io/public-vinyl-radio/*` images.
4. Deploy with `just deploy vX.Y.Z`.

Images are built for **amd64 only**, deliberately — the homelab targets are
amd64 and QEMU emulation in CI is too slow to be worth it.

Version source of truth is the root `package.json`, mirrored into
`my-collection-search/package.json` for the About page.

## Gotchas

- **Don't run `next dev` or `next build` on the host.** It corrupts the `.next`
  directory shared with the dev container.
- **`packages/groovenet-python` is generated** by `just generate-python-client`.
  Hand edits are lost on the next regeneration, and it is excluded from linting.
- **`just bootstrap-js` rewrites `my-collection-search/package-lock.json`.**
  That diff is churn; don't commit it unless you actually changed dependencies.
