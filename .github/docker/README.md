# CI base image

The web `test` and `fingerprint-service-coverage` jobs run inside
`ghcr.io/public-vinyl-radio/ci-base`, pinned to the digest returned by
`ci-image.yml` for that run. The image includes Node, the exact npm pin,
ffmpeg/ffprobe, libchromaprint, Python for native-library smoke checks,
Git/curl/GPG, and the Docker CLI with Compose. Jobs run as UID 1001, matching
hosted runner ownership and filesystem permission checks. It contains no app code
or installed application dependencies. Ubuntu 24.04 keeps system Python 3.12
and native libraries aligned with the hosted runners. Python environments are still
managed by `setup-uv` and `uv sync`.

## Publishing and refresh

The reusable publisher hashes `ci-base.Dockerfile` and the effective Node/npm
pins (`.mise.toml` and root `package.json`). App/root npm pins and mise are
validated by the existing `setup-npm` action. Application source, dependency
bumps that do not change the npm pin, and release version bumps reuse the same
recipe tag. A changed Dockerfile, Node pin, or npm pin creates a new recipe.

A maintainer branch can bootstrap a missing recipe as part of PR CI, so the
consumer jobs wait for a smoke-tested image rather than racing its first push.
Only the publisher gets `packages: write`; test jobs get `packages: read` and
use their `GITHUB_TOKEN` to pull the repository-linked package. Dependabot and
fork PRs only reuse already-published recipes; changing the recipe in a
read-only PR requires a maintainer to publish that recipe first.

New recipes are built for **linux/amd64 only**, loaded locally, checked for the
requested Node/npm versions, ffmpeg/ffprobe, libchromaprint and Docker Compose,
then pushed. The test jobs retain their own ffprobe/Chromaprint assertions.
Their normal startup does not contact apt.

`CI Base Image` also runs on relevant main-branch changes and every Monday.
Scheduled runs bypass build cache and pull current Node/Ubuntu packages. This
refreshes ffmpeg and other native security updates without needing an arbitrary
version bump in the repository. The recipe tag can advance on a refresh; each
consumer still resolves and uses an immutable digest for its entire run.
Manual refresh is available after this workflow lands on main:

```sh
gh workflow run ci-image.yml -f refresh=true
```

The package is linked to this repository by its OCI source label. If automatic
Actions access inheritance is disabled at the organization level, grant this
repository Actions access to `ci-base` in the package settings before use.
There is no change to application image targets, tags, release promotion, or
production service Dockerfiles.

## Local checks

```sh
just bootstrap-node
just lint-all
docker buildx build --platform linux/amd64 \
  --build-arg NODE_VERSION=26 --build-arg NPM_VERSION=12.0.1 \
  -f .github/docker/ci-base.Dockerfile -t groovenet-ci:test .github/docker
docker run --rm groovenet-ci:test bash -euc '
  node --version
  npm --version
  ffprobe -version
  python3 -c '\''import ctypes; ctypes.CDLL("libchromaprint.so.1")'\''
  docker compose version
'
```

Use the current `.mise.toml` Node version and `package.json` npm pin when they
change. In job containers, `setup-npm` uses an empty `node-version` input to
keep the already-verified Node installation, retains the npm download cache,
checks all npm pin sources, and skips reinstalling npm when it already matches.
Other jobs continue to select Node 26 by default.

## Change-based CI

PRs run `test.yml` once directly; `docker-publish.yml` runs image validation
alongside it without publishing. Branch pushes without a PR no longer run the
test workflow. New commits cancel superseded PR tests and image builds.
Main pushes call the same test workflow as a publishing gate.

Both workflows call `changes.yml`, backed by `.github/scripts/ci-changes.mjs`.
PR comparisons use the merge base; pushes compare the complete before/after
range. Deletions and both sides of renames count. Unknown/initial push ranges
run everything, while Git comparison errors fail CI.

Web UI edits run web lint, type checking, coverage and web image checks. Server,
API contract, migration and app configuration changes also run the Python API
contract and database/Redis integration checks. Shared contracts trigger Node
consumers; the Node client triggers player/CLI checks; the Python client
triggers both worker suites and images. CI/toolchain changes rerun the relevant
checks conservatively. Update the classifier and its regression tests whenever
adding a component or shared dependency:

```sh
node --test .github/scripts/ci-changes.test.mjs
```

Main still builds **all** service images even when only one service changed:
`deploy-rc` and release promotion require every image under the same commit SHA.
Keep this invariant until deployment supports reusing per-service image digests.
Codecov flags carry forward the previous coverage for skipped components;
the web coverage command itself executes the full web suite once.
