# Groovenet — agent guide

Vinyl collection manager for DJs: a Next.js app over Postgres, with Python
services for audio analysis, downloads and playlist optimisation.

`AGENTS.md` is a symlink to this file, so Codex and Claude Code read the same
guidance. Each service has its own `CLAUDE.md` with the detail for that service;
Claude Code loads those automatically when you work in the directory. Start
there rather than expanding this file.

| Service             | Directory                    | Detail                                           |
| ------------------- | ---------------------------- | ------------------------------------------------ |
| Next.js app + API   | `my-collection-search/`      | [CLAUDE.md](my-collection-search/CLAUDE.md)      |
| Download worker     | `download-worker/`           | [CLAUDE.md](download-worker/CLAUDE.md)           |
| Audio analysis      | `essentia-api/`              | [CLAUDE.md](essentia-api/CLAUDE.md)              |
| Playlist optimiser  | `ga-service/`                | [CLAUDE.md](ga-service/CLAUDE.md)                |
| Fingerprint matcher | `fingerprint-service/`       | [CLAUDE.md](fingerprint-service/CLAUDE.md)       |
| MCP server          | `mcp-server/`                | [CLAUDE.md](mcp-server/CLAUDE.md)                |
| Typed API client    | `packages/groovenet-client/` | [CLAUDE.md](packages/groovenet-client/CLAUDE.md) |
| CLI                 | `packages/groovenet-cli/`    | [CLAUDE.md](packages/groovenet-cli/CLAUDE.md)    |
| Python API client   | `packages/groovenet-python/` | [CLAUDE.md](packages/groovenet-python/CLAUDE.md) |

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
`redis`, `download-worker`, `fingerprint-service`, `fingerprint-set-worker`.

## Data flow

**Import** — Discogs API → parse → Postgres → visible in the app.

**Download and analyse** — the app pushes a job onto the Redis list
`download_queue`; `download-worker` pops it, downloads with gamdl or yt-dlp,
writes to the shared `/audio` volume, calls essentia-api for BPM/key/mood, then
writes results back through the app's REST API.

**Playlist optimisation** — the app posts the selected tracks to ga-service
`/optimize`, which returns an ordering tuned for BPM and key transitions.

**Vinyl play tracking** — a listener posts audio chunks to `POST
/api/audio/ingest`, which validates them with ffprobe, writes them to the
shared `audio_ingest` volume and pushes a job onto the Redis list
`fingerprint_queue`; `fingerprint-service` pops it, decodes to mono PCM, matches
it against the reference fingerprint index with Chromaprint, and reports back
over REST. Epic #281. The app sweeps that volume on a timer —
raw audio is discarded once its `audio_ingests` row is terminal, and a file
being written or decoded right now is never touched.

**Reference indexing** — that match needs an index to search, built ahead of
time by `groovenet fingerprint-library`. The app resolves the scope to tracks
with a `local_audio_url` and queues one job per track on `fingerprint_index_queue`;
`fingerprint-service` hashes each file, skips it when the stored `audio_sha256`
still matches, and otherwise fingerprints it and persists the result through the
app's REST API. Idempotent by design — a second run does no work.

**Set derivation** — the offline sibling of play tracking, for a whole recorded
set (#282). A job on `fingerprint_set_queue` names a file on the
`set_recordings` volume; `fingerprint-set-worker`, a second process of the same
image, streams it through ffmpeg into Chromaprint, matches every 15 s window
against the same index and posts the per-window matches back. The app groups
them into plays and diffs against the planned playlist. A separate worker so a
multi-minute decode never delays a live window.

## Working on this repo

`just --list` is the command surface; prefer it over raw `docker compose`.
For GitHub issue and PR work in this repo, use the `gh` CLI with network access;
the sandbox cannot reach `api.github.com`.

```bash
just bootstrap        # deps + pre-commit hook
just compose-dev      # hot-reload stack
just migrate-up       # apply migrations
just test             # web + packages
just lint-all         # every pre-commit hook, as CI runs them
```

Parallel tasks run in git worktrees, each with its own compose stack via
`just worktree-up`. With [herdr](https://herdr.dev), `just herdr` attaches to
the `groovenet` session and `just herdr-task <branch>` (from inside it) opens a
worktree workspace off `origin/main`, runs `just worktree-setup` (`just
bootstrap`, then its stack) and starts a coding agent once that succeeds. It
hands off to `herdr-agent` from the dotfiles, which owns the agent choice:
pass `--agent`, `--model`, `--prompt-file` or `--issue N`, and `--no-stack`
for work that needs no stack.
Golden seeds are created and restored from
`~/.herdr/worktree-seeds/<main-checkout-name>/latest`. `just worktree-seed`
refreshes the seed from a local stack; `just worktree-seed-prod` refreshes it
from production. Override the location with `SEED_ROOT`, or use
`just worktree-up --seed PATH` to restore a specific bundle.
Production seed creation reads covers through the app container, independent
of the host's Docker volume names. An explicit `PROD_SEED_COVERS_PATH` host-path
override checks sudo access before dumping and prompts locally if needed.
`latest` advances only after the database and covers
have both finished copying. Existing worktree databases are preserved; to
recreate one from the current seed, run `just worktree-purge` then
`just worktree-up` in that worktree. Purging deletes all of that worktree's
Compose volumes, including its database.
When the task is done, run `just herdr-done` from a pane inside that
workspace to tear down the stack and remove the workspace in one step (it
refuses on uncommitted or unpushed changes unless `--force`, and can delete
the branch with `--delete-branch` once its PR has merged).

Removing a worktree by hand (`herdr worktree remove`, `git worktree remove`)
leaves its compose stack and Caddy fragment behind — `herdr-done` cleans up
the one it's running in, but anything removed another way needs
`just worktree-gc`. It's a dry run by default; pass `--apply` to actually
remove the stacks and fragments it finds.

Pre-commit runs file hygiene, ruff over the Python services and Python client,
ESLint over the web app, Node client, CLI and MCP server, then Prettier and
`ruff format`. CI runs the same hooks, so `--no-verify` only defers the failure.
`just format` rewrites tracked files and `just format-check` only checks. Let
the formatters own layout: don't hand-wrap lines, and don't add ESLint or ruff
rules about style. Generated and tool-owned files belong in `.prettierignore`.

### Coverage is a required PR check

Passing tests is not enough: Codecov enforces **patch coverage** on changed
executable lines. Before calling a PR ready, run coverage for every component
touched, not only its normal test command:

```bash
npm run test:coverage --prefix my-collection-search
npm --workspace @groovenet/client run test:coverage
npm --workspace @groovenet/cli run test:coverage
```

Use the equivalent `pytest --cov` command from `.github/workflows/test.yml` for
a changed Python service. Inspect the generated coverage report against the
diff and add tests for uncovered success paths, error paths, conditionals and
repository methods. A line reported as "partial" means not all branches were
exercised and needs another case. Gated integration tests do not contribute to
the standard coverage job unless that job explicitly runs them, so new code
also needs unit coverage. After pushing, check the `codecov/patch` result with
`gh pr checks`; do not describe the work as complete while that required check
is failing.

## Conventions

- **Conventional Commits**, squash-merged. The PR title becomes the commit, and
  release-please reads it — so the title matters more than the branch.
- **Postgres is the source of truth.** Schema changes need a migration in
  `my-collection-search/migrations/`; verify with `just migrate-test`.
- **Track types live in `my-collection-search/src/types/track.ts`.** Other
  packages still copy those types; migrated API contracts such as live sets
  live in `packages/groovenet-contracts/` and are imported by each consumer.
- **Build order for the packages:** client → player → cli → mcp-server
  (`just build-packages`).
- **Integration tests are gated** behind `RUN_*_TESTS` env vars and run against
  throwaway containers (`just migrate-test`, `just redis-test`,
  `just fingerprint-test`, `just ingest-test`, `just debug-reads-test`,
  `just spin-sessions-test`, `just play-detections-test`,
  `just record-care-test`, `just embedding-versions-test`). Use them when bumping
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

To test before releasing, `just deploy-rc` deploys the tip of `main` as a
release candidate: the `sha-<short>` images CI already built, which a release
later promotes unchanged. See "Testing a release candidate" in `RELEASING.md`.

Images are built for **amd64 only**, deliberately — the homelab targets are
amd64 and QEMU emulation in CI is too slow to be worth it.

Version source of truth is the root `package.json`, mirrored into
`my-collection-search/package.json` for the About page.

## Gotchas

- **Never commit `openapi-generated.json`.** It is a local generated artifact.
  Run `just generate-spec` to validate API changes, but keep the output ignored
  and out of commits and PRs.

- **Don't run `next dev` or `next build` on the host.** It corrupts the `.next`
  directory shared with the dev container.
- **Storybook:** `just storybook` runs the separate component dev server (6006);
  set runtime `STORYBOOK_URL=http://localhost:6006` for the hot-reload app's link.
  App images build/verify `public/storybook` automatically and serve it at
  `/storybook/index.html`; production must not mount over it. The old
  `STORYBOOK_STATIC_DIR` override is retired. See README's Storybook workflow.
- **Python app requests use `GroovenetClient`** in `packages/groovenet-python`.
  Add only consumed endpoints, with exact-request tests and an OpenAPI path/verb
  check. See its guide; `just generate-spec` generates the contract, not code.
- **`just bootstrap-js` uses strict `npm ci` under the pinned npm toolchain.**
  It must leave lockfiles unchanged and fails on an inconsistent lockfile;
  diagnose that failure instead of falling back to `npm install`. See the
  README's toolchain notes for pin updates and drift checks.
- **One TypeScript, the 6.x alias, everywhere** (`npm:@typescript/typescript6`,
  binary `tsc6`): typescript-eslint has no TypeScript 7 support. A `typescript`
  entry on any other version nests a copy under that package. The dev container
  uses the host-built `packages/groovenet-{contracts,client}/build`, so rebuild
  a package on the host after changing it.
