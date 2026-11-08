# Saved playlist validation (#1099)

Validated on macOS on 2026-11-07, using the desktop native client. No physical
speaker or Knulli device was used.

- `just brick-test`: native application/navigation/SDL rendering and loopback TLS
  contract fixture passed. Saved positions are sorted, composite friend identities
  survive replacement/append, and 27 tracks load through explicit 25-track pages.
- `just brick-coverage`: instrumented production application sources, native UI
  tests and the TLS fixture passed. The report is generated at
  `build-coverage/coverage.lcov`; changed success, failure and conditional paths
  were inspected against the diff.
- TLS fixture: revision conflict opens the standard acknowledgment; a dropped
  append response is reported as ambiguous and is attempted once; a subsequent
  audio rejection is explained. Exactly four deliberate queue requests are
  observed, including a successful append. No takeover or availability override is
  sent. Empty playlists, missing batch rows, absent audio, malformed/mismatched
  details, bounded lists, authorization/service errors and superseded loads are
  covered. Collection authorization failure retains player connectivity.
- Navigation: Back restores focus; Cancel is the default replacement choice;
  transport input cannot bypass confirmation; opening Browse abandons an old
  action context. Loading prevents selecting stale rows or submitting a queue
  mutation. Mock fixtures keep saved music independent of queue mutations.
- `just build-packages` and
  `mise exec -- node apps/groovenet-brick/tests/development_smoke.mjs`: passed
  against the production player HTTP/SSE manager/store, a disposable Postgres 17
  container and a silent in-memory backend. Appending while stopped leaves
  playback stopped. Starting the saved playlist yields `two`, `one`; appending
  its second track yields `two`, `one`, `one`. A separate REST controller observes
  the shared queue and playing state. Wake/restart retain the selected player,
  and exiting the Brick leaves the server playing with all three entries.
- `just lint-all`: all repository pre-commit checks passed.

The existing collection APIs return whole lists. Client limits are 2 MiB per
response, 1,000 playlists and 1,000 refs per playlist, plus explicit 25-track
metadata pages. Exceeding limits fails visibly. Whole-playlist actions send all
saved refs; the player validates unvisited metadata pages, and rejection never
silently drops a track. No schema, API, credential or environment changes.

The checked-in screenshots show the saved-track list and default-cancel queue
replacement confirmation. Hardware playback, firmware lifecycle and physical
button qualification remain in #1102.
