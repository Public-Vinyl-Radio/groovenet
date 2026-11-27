# Releasing GrooveNet

Releases are driven by [release-please](https://github.com/googleapis/release-please)
using [Conventional Commits](https://www.conventionalcommits.org/). You never tag
by hand — merging a "Release PR" cuts the version, and CI publishes the images.

## The flow

```
Conventional commits land on main
        │
        ▼
release-please opens/updates a "Release PR"   (bumps version + CHANGELOG.md)
        │   ← review the version + changelog; this is the "production-worthy" gate
        ▼
merge the Release PR
        │
        ▼
release-please creates tag vX.Y.Z + GitHub Release
        │
        ▼
docker-publish.yml builds & pushes ghcr.io/public-vinyl-radio/*:vX.Y.Z (+ :latest)
        │
        ▼
deploy: pin IMAGE_TAG=vX.Y.Z on the homelab box and pull (see below)
```

## How the version is decided

Commit / PR title prefix → bump (repo is pre-1.0, so bumps are conservative):

| Prefix                                   | Example                    | Bump (pre-1.0)        |
| ---------------------------------------- | -------------------------- | --------------------- |
| `fix:`                                   | `fix: correct BPM parsing` | patch (0.1.0 → 0.1.1) |
| `feat:`                                  | `feat: add about page`     | patch (pre-1.0)       |
| `feat!:` / `BREAKING CHANGE:`            | `feat!: drop v1 API`       | minor (pre-1.0)       |
| `chore:`, `docs:`, `refactor:`, `ci:`, … | —                          | no release            |

Because PRs are **squash-merged**, the **PR title** is the commit message that
release-please reads. The `PR Title` check enforces a valid prefix.

### The marketing site

`site/` and `docs/` are excluded from the root release (`exclude-paths` in
`release-please-config.json`), so site work never bumps the app version or
lands in `CHANGELOG.md`. Use `docs(site): …` for it.

### Going 1.0 (or forcing a version)

Add a footer to any commit / the Release PR:

```
Release-As: 1.0.0
```

## Workspace dependencies

`packages/groovenet-cli` depends on `@groovenet/client`, so the two versions
have to move together. The `node-workspace` plugin in
`release-please-config.json` handles that: when the client's version bumps,
release-please rewrites the CLI's dependency range to match and bumps the CLI
alongside it.

Without it, a major bump breaks CI. The client going to `2.0.0` while the CLI
still asks for `^1.0.2` leaves npm unable to satisfy the workspace link, and
`npm ci` fails on every job with:

```
npm error Missing: @groovenet/client@1.0.3 from lock file
```

That message points at the lock file, but the lock file is not the problem —
the unsatisfiable range is.

They must also be released **in the same PR**, which is why
`separate-pull-requests` is `false`. Split across two PRs, neither can merge
first:

- client to `2.0.0` alone leaves the CLI asking for `^1.0.2` — `npm ci` fails
  with `Missing: @groovenet/client@1.0.3 from lock file`
- CLI alone carries `^2.0.0` while the client is still `1.0.3` — `npm ci` fails
  with `notarget No matching version found for @groovenet/client@^2.0.0`

Neither message names the real cause, which is the version skew between the two
packages. One PR means both bumps land together and `main` is never in that
state.

The cost is that the root package releases in the same PR as the packages
rather than on its own. That is the trade for the packages being safe.

Setting `merge` on the plugins does **not** substitute for this —
`separate-pull-requests: true` splits by component regardless, and
release-please will not regroup release PRs that are already open. If the
grouping ever needs to change again, close the open release PRs first so they
are rebuilt from scratch.

## Why the root package has no name

The root package has `"package-name": ""` in `release-please-config.json`
on purpose. Giving it a name breaks tagging whenever a release PR bumps only the
root package.

A release PR that bumps only the root package lists one entry with no component
(`<summary>0.2.6</summary>`). release-please reads that as a single-package PR
and checks that the PR branch's component matches the package's component. The
branch, `release-please--branches--main`, has no component. A named root package
takes its name as its component, so the check fails. release-please logs:

```
PR component: undefined does not match configured component: groovenet
There are untagged, merged release PRs outstanding - aborting
```

The Release PR merges, but nothing is tagged and no images are published. An
empty name gives the root package an empty component, which matches the branch.
Release PRs that also bump the client or CLI take a different path, which is why
the problem only shows up for root-only releases (v0.2.3 and v0.2.6 both hit it).

If a release PR ever gets stuck at `autorelease: pending` anyway, create the
release against its merge commit with `gh release create vX.Y.Z --target <sha>`,
then swap the label to `autorelease: tagged`.

## One-time setup

1. **`RELEASE_PLEASE_TOKEN` secret** — release-please must create the tag with a
   PAT, not the default `GITHUB_TOKEN` (tags made with `GITHUB_TOKEN` do **not**
   trigger `docker-publish.yml`). Create a fine-grained PAT scoped to this repo
   with **Contents: read/write** and **Pull requests: read/write**, and save it
   as the `RELEASE_PLEASE_TOKEN` repository secret.
2. **Squash merge** — enable "Allow squash merging" and set the default squash
   commit message to **"Pull request title"** in the repo settings.

## Deploying a release (homelab)

Images are published to GHCR; deploy is always a local pull on the box (nothing
in CI touches your homelab). The convenient path:

```bash
just deploy v1.2.0        # pulls ghcr images for that tag, migrates, and restarts
```

When using the 1Password-backed `.env.tpl`, export these optional overrides in
the shell running the command. They also apply to `just compose-*`,
`just worktree-up`, direct `op run --env-file=.env.tpl`, and
`scripts/render-env.sh`:

| Variable                 | Default     | Selects                     |
| ------------------------ | ----------- | --------------------------- |
| `GROOVENET_OP_VAULT`     | `Homelab`   | Vault containing both items |
| `GROOVENET_OP_ITEM`      | `groovenet` | Application secrets item    |
| `GROOVENET_OP_MQTT_ITEM` | `MQTT`      | MQTT broker item            |

Leave a variable unset to use its default; an explicitly empty value does not
use the default. These variables must be exported or passed on the command
line: putting them in `.env` does not configure `op` template resolution.

For example, to use your own vault and items without editing the template:

```bash
export GROOVENET_OP_VAULT=Other
export GROOVENET_OP_ITEM=GroovenetProd
export GROOVENET_OP_MQTT_ITEM=Broker
just deploy v1.2.0
```

Create both items in the selected vault with the following exact field names:

- `GROOVENET_OP_ITEM`: `POSTGRES_PASSWORD`, `DATABASE_URL`, `OPENAI_API_KEY`, `APPLE_MUSIC_TEAM_ID`, `APPLE_MUSIC_KEY_ID`, `APPLE_MUSIC_PRIVATE_KEY`, `DISCOGS_USER_TOKEN`, `DISCOGS_USERNAME`, `YOUTUBE_API_KEY`, `NEXT_PUBLIC_POSTHOG_KEY`, `RESTIC_REPOSITORY`, `RESTIC_PASSWORD`, `B2_ACCOUNT_ID`, `B2_ACCOUNT_KEY`.
- `GROOVENET_OP_MQTT_ITEM`: `host`, `username`, `password`.

The application item's `NEXT_PUBLIC_POSTHOG_KEY` field supplies `POSTHOG_KEY`.
The MQTT item's `host` field supplies `MQTT_URL` and must contain a full broker
URL, such as `mqtt://broker.example.com:1883`. Remote deploy recipes resolve
the template locally and copy the rendered `.env` to the server. On-server
deploy scripts use an existing `.env` first and fall back to `.env.tpl` through
`op run` when no `.env` exists.

Or manually on the box:

```bash
# pin the release you want
echo "IMAGE_TAG=v1.2.0" >> .env

docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm migrate
```

Rollback = `just deploy v1.1.0` (the previous tag). Images are immutable, so
rollback is exact.

### Upgrading to the non-root images (#1074)

Every image now runs as a non-root user: uid/gid 1001 for the app and the four
Python services (the uid `entrypoint.sh` has always chowned the app's volumes to),
and the stock `postgres` and `redis` users for the database and Redis. There is no
manual step. `docker compose up` (so `just deploy`, `just deploy-rc` and the
installer) now starts a one-shot `volume-perms` service first, like `migrate`, which
the app, download worker and fingerprint services wait for. It re-owns what older
root containers left behind: the small metadata volumes (dumps, Discogs exports,
cookies, essentia-data, covers) in full, and for the media volumes (audio, ingest,
set recordings) the top level plus any file owned by root. A file owned by anyone
else, such as a host music library bind-mounted in, is left alone. It takes tens of
milliseconds once nothing is left to fix, and exits 0.

- The database and Redis volumes need nothing: their files already belong to
  `postgres` and `redis`, which is who the stock images dropped to.
- `WORKER_AUDIO_MOUNT` is not fixed separately. If it points somewhere other than
  `APP_AUDIO_MOUNT`, make that directory writable by uid 1001 yourself.
- Rolling back to an older tag is safe: root containers read and write
  1001-owned files, and `volume-perms` leaves ownership consistent for the next
  upgrade. `volume-perms` pulls `alpine` on first use.
- Root filesystems are read-only (#1074 part 3). Two new disposable volumes appear on
  first `up`, `worker_downloads` and `worker_tmp`: the download worker's scratch
  space, which used to live in the container. Nothing to configure; they only need
  free disk for a download in flight.
- Check after deploying: `docker compose ps -a` shows `volume-perms` exited 0, and
  `docker exec <container> id -u` is `1001` for the app, worker, essentia,
  ga-service and fingerprint services, `999` for db and redis.

## Testing a release candidate on the box

Every push to `main` already builds and pushes **all six** images as
`sha-<7 hex>`, after lint and tests pass — and a release later _promotes_
those same images rather than rebuilding them. So any merged commit is a
complete release candidate, and what you test is byte-for-byte what ships.

```bash
just deploy-rc                 # the tip of origin/main
just deploy-rc abc1234         # a specific main commit
just deploy sha-abc1234        # the same, by image tag
just check-images sha-abc1234  # only check its images exist
```

`deploy-rc` prints the commit and everything it adds since the last release,
then checks that every service has an image under that tag before touching the
box. A candidate is only as complete as its CI run: deploying while one image
is still building would move some services forward and fail to pull the rest,
so a missing image stops the deploy instead. It refuses a commit that is not on
`origin/main`, since CI never built images for it.

The loop:

1. Merge the PRs you want to test.
2. Wait for **Build and Publish Docker Images** on that commit to go green.
3. `just deploy-rc`, and test end to end.
4. Merge the release PR. It promotes the images you just tested.
5. `just deploy vX.Y.Z` — a restart onto identical images.

To back out, `just deploy <previous vX.Y.Z>`. Migrations only move forward; a
candidate that added tables leaves them in place, which the previous release
ignores. A candidate that _changed_ or dropped something needs more thought
before you test it on real data.

Two things a candidate is not:

- **Not a git tag.** `v0.3.0-rc.1` would match the publish workflow's
  `v*.*.*` trigger, and `promote` would tag it `latest`. Candidates are image
  tags only.
- **Not a new version number.** The About page reads `package.json`, so it
  shows the last release's version while a candidate is running.
  `deploy-rc` prints the commit; that is the identity to note.

The CLI is not part of a candidate. To try an unreleased command against it,
run the CLI from a checkout of the same commit:

```bash
npm run build -w packages/groovenet-client -w packages/groovenet-cli
node packages/groovenet-cli/build/bin/groovenet.js sets derive set.mp3 --playlist 176
```

> `just release` no longer tags/builds/deploys in one shot — releases are cut by
> release-please.

Production deploys default to `COMPOSE_PROFILES=all`, starting all optional services. Set `COMPOSE_PROFILES` explicitly to select a different set. When the host has a `.env.players` file (server players), `deploy-prod.sh` adds `players` to the effective list, once, and exports it for every compose call; the shell value wins over `.env.host`, which wins over the `COMPOSE_PROFILES=` line in `.env`/`.env.tpl`, which wins over `all`.

`just deploy` renders `.env` on the deploying machine and copies it over the host's `.env` every time, so a host-specific setting such as `COMPOSE_PROFILES=all,lossless` cannot live there. Put it in `.env.host` in the stack directory on the production host (start from `.env.host.example`). It is untracked, is created and edited on the host only, and `deploy-prod-remote` never writes or overwrites it. `deploy-prod.sh` reads `COMPOSE_PROFILES` (and `GAMDL_WRAPPER_IMAGE`) from it line by line, never sourcing it, passes it to every compose call as an extra `--env-file` after `.env`, and prints the effective profile list and where it came from. When `lossless` is enabled it checks that the wrapper image exists locally and aborts before pulling or recreating anything if not.

## Picking what to deploy

`just deploy-pick` lists the last 5 release tags and the last 5 commits on
`origin/main`, newest first, then runs `just deploy vX.Y.Z` or
`just deploy-rc <sha>` for the one you choose. It only chooses a ref; those
recipes are unchanged and still do the deploying.

```bash
just deploy-pick                # choose from the list, confirm, deploy
just deploy-pick --list         # print the table and stop: no prompt, no deploy
just deploy-pick --limit 10     # rows of each kind (default 5)
just deploy-pick --no-fzf       # numbered prompt even when fzf is installed
```

```
  KIND     REF           BUILT             IMAGES     SUMMARY
  main     sha-4c5f38d   2026-11-27 15:14  building   feat(backup): keep lossless out of the remote…
  main     sha-f3f0a2e   2026-11-27 12:55  ready  ●   feat(settings): contextual guidance for missing…
  release  v0.4.2        2026-11-26 12:02  ready      chore: release main (#1309)
```

- **BUILT** is the commit's time, in your local time zone.
- **IMAGES** comes from that commit's **Build and Publish Docker Images** run
  (`gh run list --json`, one call per invocation; a main row matches by commit
  sha, a release by its tag): `ready` (the run succeeded; for a release that
  includes `promote`), `building`, `failed`, or `no run` when CI never built it.
  Only `ready` rows can be picked. Pick one that is not and it refuses.
- **●** marks the ref production runs now, read over SSH from the `app`
  container's image tag (5 s connect timeout). If SSH fails the picker warns,
  shows no marker and carries on.
- With [fzf](https://github.com/junegunn/fzf) installed you pick in fzf;
  otherwise it prints a numbered list and asks. Either way it shows the exact
  `just` command and the target `host:stack dir`, and waits for `y`.

It needs `gh` (logged in) and `git`, and never writes to GitHub. It uses the
same `PROD_HOST` and `PROD_STACK_DIR` as `deploy`, and refuses to run while
`PROD_HOST` is still the placeholder. Export them in your shell profile or a
direnv `.envrc` (copy `.envrc.example`); no host belongs in the repo.

## Brick Knulli assets

`brick-release.yml` cross-compiles the existing Brick package independently of npm.
Scoped PRs and manual workflow runs provide experimental CI artifacts. Root app
`vX.Y.Z` releases attach `groovenet-brick-X.Y.Z-knulli-scarab-arm64.tar.gz` and its
checksum only when the tagged qualification record passes for the exact binary
and launcher. Package-only release tags do not publish Brick assets.

See [build/install instructions](apps/groovenet-brick/knulli/README.md) and
[qualification evidence](apps/groovenet-brick/evidence/release-1102.md).
The first complete remote release remains blocked on physical acceptance,
unplugged measurements and SDK/ABI review. Never mark pending device checks as
passed from desktop tests. Commit actual observations and hashes before the next
release-please release; do not move an existing release tag to add evidence.
