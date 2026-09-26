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

| Prefix | Example | Bump (pre-1.0) |
|--------|---------|----------------|
| `fix:` | `fix: correct BPM parsing` | patch (0.1.0 → 0.1.1) |
| `feat:` | `feat: add about page` | patch (pre-1.0) |
| `feat!:` / `BREAKING CHANGE:` | `feat!: drop v1 API` | minor (pre-1.0) |
| `chore:`, `docs:`, `refactor:`, `ci:`, … | — | no release |

Because PRs are **squash-merged**, the **PR title** is the commit message that
release-please reads. The `PR Title` check enforces a valid prefix.

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

## Testing a release candidate on the box

Every push to `main` already builds and pushes **all six** images as
`sha-<7 hex>`, after lint and tests pass — and a release later *promotes*
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
ignores. A candidate that *changed* or dropped something needs more thought
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
> release-please. The `release-localbuild-*` recipes remain as an escape hatch
> for building + deploying locally (e.g. bypassing the registry) and still use
> timestamp tags, which is fine for non-registry local builds.
