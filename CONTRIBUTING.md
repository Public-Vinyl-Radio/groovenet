# Contributing

Thanks for helping improve GrooveNet. For larger changes, open an issue first so we can agree on the approach.

## Development setup

Follow the [development setup guide](https://groovenet.publicvinylradio.com/docs/getting-started/running/#development-and-production) for prerequisites, bootstrap, and the local development stack.

## Toolchain and dependencies

The repository pins Node and npm in `.mise.toml` and package manifests. Use `mise` to select the versions, then install dependencies with `npm ci`. Keep lockfiles committed and up to date; dependency changes should leave a clean `npm ci` install.

## Before opening a pull request

- Use a Conventional Commit title, such as `fix: correct playlist ordering`. Release-please reads the PR title when preparing releases.
- Run `just lint-all` and fix any failures.
- Changed executable lines must meet Codecov's patch coverage requirement. Run coverage for the component you changed.
- Include a migration with database schema changes and verify it with `just migrate-test`.
- Run relevant gated integration checks when changing code they cover. These include `just migrate-test`, `just redis-test`, `just fingerprint-test`, `just ingest-test`, `just debug-reads-test`, `just spin-sessions-test`, `just play-detections-test`, `just record-care-test`, `just embedding-versions-test`, and `just backfill-test`.

## Formatting

Use `just format` to format tracked files and `just format-check` to check without writing. Prettier handles JavaScript, TypeScript, JSON, YAML, Markdown, and CSS; Ruff handles Python.

## Storybook

Run `just storybook` to start Storybook at <http://localhost:6006>. The repository's [agent guide](CLAUDE.md) has details on connecting it to the development app.

## Python API client

Python services share the hand-written client in `packages/groovenet-python`. Add only consumed endpoints, with exact-request and error tests, and update the OpenAPI contract with `just generate-spec`. See the [Python client guide](packages/groovenet-python/CLAUDE.md).

## Repository guidance

This guide is for human contributors. The [root `CLAUDE.md`](CLAUDE.md) documents agent and maintainer workflows; it links back here for contribution requirements.
