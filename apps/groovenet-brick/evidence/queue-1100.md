# Shared queue validation — #1100

Validated on macOS on 2026-11-08.

- `just brick-test`: native state/navigation/rendering and loopback TLS fixture.
- `just brick-coverage`: Clang instrumentation of the production native sources;
  inspected changed lines and branches in `build-coverage/coverage.lcov`.
- `just build-packages`, `just brick-build`, then
  `mise exec -- node apps/groovenet-brick/tests/development_smoke.mjs`:
  production player manager/store/HTTP/SSE with disposable Postgres and a silent
  backend. The database/container were removed by the harness afterward.
- `just lint-all`: all repository pre-commit hooks.

The native controller appended a duplicate track, moved and played that specific
entry UUID, removed the other copy, and cleared the shared queue. An independent
REST controller observed the resulting queue and stopped state. That second
controller also reordered the queue while the native client observed the update
through SSE. The smoke restored a playing three-entry queue and verified that
exiting the native client left server playback and queue intact.

Deterministic tests exercise default-cancel clear confirmation, current/focused
entry removal, duplicate identities, UUID focus across remote reorder/removal,
27-entry navigation and paging, missing metadata/audio, disconnected navigation,
stale tokens, and canceled/replaced subscriptions. The real TLS fixture rejects a
stale revision, loses a write response, requires speaker takeover approval, and
exceeds libcurl’s eight-second deadline. It counts requests to prove none of those
writes are automatically repeated and asserts no takeover/availability override.

This validates desktop application and server interaction. No physical Brick,
OwnTone engine or speaker was used; device/audio qualification remains in #1102.
