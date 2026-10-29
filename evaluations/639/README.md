# Docker build and dev startup measurements (#639)

Measured on 2026-10-22 with OrbStack, native Linux ARM64 containers, Node 26,
npm 12.0.1, and BuildKit v0.33.1. The original checkout was
`44c822c59cec8a828e47671df49ee67965cf2e83`. Each row is a single sample, not an
average. Existing unrelated worktree stacks remained running throughout.
CI continues to publish AMD64 only; these local results do not predict CI
speedups directly.

## Local results

| Scenario                                                | Before (seconds) | After (seconds) |
| ------------------------------------------------------- | ---------------: | --------------: |
| Empty layer + mount caches, excluding builder bootstrap |           107.82 |          171.13 |
| Build without layer cache, retaining cache mounts       |           141.60 |           88.21 |
| Unchanged warm production build                         |             1.66 |            2.79 |
| Backend route edit, warm production build               |            26.26 |           17.34 |
| Test + documentation edit, warm production build        |                — |            1.46 |
| Shared frontend edit, warm production build             |                — |           16.84 |
| Fresh dependency volume, app startup                    |            29.44 |           28.13 |
| Existing dependency volume, app restart                 |            12.88 |            1.99 |
| Changed lockfile, app restart                           |                — |           11.91 |

The completely empty-cache builds used separate temporary `docker-container`
builders, removed between revisions. Raw wall times were 119.42 and 173.73
seconds, including 11.6 and 2.6 seconds of BuildKit bootstrap respectively;
the table subtracts those bootstrap steps. The revised build was slower in
this sample: apt layers took 138.1 seconds combined versus 51.0 seconds before,
and app dependency installation took 48.6 versus 28.6 seconds. Download timings
varied substantially. These single samples establish no cold-build improvement.

The no-layer-cache comparison reuses npm, apt and Next cache mounts and is
sensitive to their prior contents and network traffic. The unchanged warm build
shows no improvement; both revisions fully reuse their layers.

Startup means container start to the first successful `/api/health` response,
including contracts compilation and the first dev route compilation. It uses
the same source bind mounts, entrypoint, dependency volume and startup command
as Compose, with temporary fixture checkouts and volumes. Other stack services
are excluded, so these are **app startup** times, not full stack readiness.
The before image is `runner`; after is the dedicated `dev` target.

The lockfile probe appends JSON whitespace, preserving a valid lockfile while
changing its fingerprint. It reinstalls dependencies and starts successfully.
An initial host-side edit was not immediately visible through the restarted
bind mount, so the recorded lockfile-change result uses an edit through that
mount from a container, with the SHA-256 verified before startup. Both versions
also repaired a deliberately created real contracts `node_modules` directory
into the `/app/node_modules` symlink.

## Cache behavior verified

- Backend change: edit `src/app/api/health/route.ts`. Before reruns Storybook
  and Next; after caches Storybook and reruns Next. Both cache npm and apt.
- Test/documentation change: edit root `README.md` and
  `src/hooks/useJobEventsSSE.test.tsx`. After caches Storybook, Next, npm and apt.
- Frontend change: edit `src/app/chakraTheme.ts`. After reruns Storybook and
  Next, retaining the npm and apt layers.
- The `dev` target builds without either Storybook or Next production builds.
- `migrator` builds independently and its existing import check loads every
  migration. The web runtime retains PostgreSQL client 16; migrator retains 15.
- The maintenance `scripts` target builds and imports `@groovenet/contracts`
  through its installed package link successfully.

Production smoke checks passed for `/api/health`, `/storybook/index.html`,
`/storybook/iframe.html`, `/storybook/index.json`, and script assets referenced
by both HTML pages. The index contains stories. Runtime tools (ffmpeg, ffprobe,
mediainfo, restic, PostgreSQL client, Docker CLI, gosu and git), npm pin,
volume directory ownership and the audio symlink were checked in the image.
The dev install helper's eight tests pass with 100% line and branch coverage;
all ten Compose deployment checks pass. Changed JavaScript passes ESLint and
the changed YAML files parse successfully.

## CI baseline

Latest successful main run at measurement time:
[39803601882](https://github.com/Public-Vinyl-Radio/groovenet/actions/runs/39803601882),
commit `ff7dad58ed60995f00279a426e6612c3d6d7acca`.
This is a nearby main revision, rather than the exact local baseline commit.
Job durations exclude queueing.

| Job             | Before (seconds) | After         |
| --------------- | ---------------: | ------------- |
| `build-webapp`  |              392 | Pending PR CI |
| `build-migrate` |              134 | Pending PR CI |
| `test / test`   |              390 | Pending PR CI |

The web image build step itself took 309 seconds. Populate the after column
from a successful PR run before assessing CI gains. Python base images and
registry caching remain later phases of #639.

## Reproduction

Use separate checkout copies for each revision. Keep unrelated stacks running
or stopped consistently; never prune the shared builder to simulate cold cache.

```sh
# Normal warm build; repeat with --no-cache for the cache-mount-retaining case.
/usr/bin/time -p docker buildx build --platform linux/arm64 --target runner \
  --progress plain -f my-collection-search/Dockerfile -t groovenet-639:bench .

# Fully cold build: create a temporary builder, bootstrap before timing, then
# remove only this builder after measuring. Repeat with a NEW builder for each
# revision so neither layer caches nor npm/apt/Next cache mounts carry over.
docker buildx create --name groovenet-639-cold --driver docker-container
docker buildx inspect groovenet-639-cold --bootstrap
/usr/bin/time -p docker buildx build --builder groovenet-639-cold \
  --platform linux/arm64 --target runner --load --progress plain \
  -f my-collection-search/Dockerfile -t groovenet-639:cold .
docker buildx rm groovenet-639-cold
```

For startup measurements, use the dev Compose app mounts with a fresh named
`node_modules` volume, poll `/api/health`, then stop/start the same container
and poll again. Repeat after changing the app lockfile. Use fixture copies to
keep generated Next/contracts output away from active checkouts.
