# @groovenet/client

Typed HTTP client for the Groovenet API, shared by the CLI and the MCP server.
Published to npm. No CLI of its own, no state beyond an axios instance.

## Shape

```
src/
  client.ts    GroovenetClient — every API method
  types.ts     domain types (Track, Album, Playlist, Friend, …)
  schemas.ts   Zod schemas
  config.ts    ~/.groovenet/config.json load/save
  playlistCheck.ts  pure playlist analysis (BPM, keys, releases, vinyl sides)
  serverPlayerSession.ts  ServerPlayerSession: snapshot/position state, stale-event fencing,
               reconnect, commands, join()/playHere(), isLive/isIdle (transport injected)
  trackLookup.ts   TrackLookup: batch-fetch + cache queue tracks by track_id + friend_id
  trackFormat.ts   pure formatters: meta line, duration, queue summary, Camelot, BPM
  playerSession.ts the browser-safe entry: the three files above and nothing else
  serverPlayerTransport.ts  clientTransport(): the Node transport for a session
  index.ts     re-exports all of the above
```

**Consumers.** The CLI (`RemotePlayerController`, `formatSeconds`) imports the package root.
The web app (`my-collection-search`, `file:` dependency like contracts) imports only
`@groovenet/client/player-session`, which must never import axios, `node:*` or anything
that does — it is bundled for the browser. Keep new browser-facing code in those files and
make anything Node-only (like `clientTransport`) reachable from `index.ts` alone. The web
resolves the package through `build/`, so `just build-packages` (or `just bootstrap`) comes
first; the dev container mounts it read-only and never rebuilds it.

A session takes a `ServerPlayerTransport` (`get`, `devices`, `command`, `subscribe`): the
web passes its `EventSource`-backed `playerApi`, Node passes `clientTransport(client)`.
`command()` reports trouble as `view.problem` and never throws (web); `execute()` throws
and resolves with the whole result (CLI). Neither replays a command.

```ts
const client = new GroovenetClient({ baseUrl, apiKey, playerApiKey, insecureTls });
```

`insecureTls` attaches an https agent with `rejectUnauthorized: false`, for
self-signed homelab certs.

Every method funnels through one private `request()`, which unwraps axios errors
into `Error("API Error: …")`, preferring the response body's `error` field, then
`message`, then the axios message.

All `/players` requests (including `serverPlayerEvents`) require `playerApiKey`;
they never fall back to `apiKey` and refuse redirects. Event subscriptions expose
validated shared events without retries/replay; consumers reconnect for a snapshot.

## Types

Most domain types are still copied from `my-collection-search/src/types/track.ts`.
Migrated API contracts live in `@groovenet/contracts`; re-export those inferred
types here so client and CLI consumers share the declaration.

## Adding an endpoint

1. Add the method to `client.ts`.
2. Copy any new types from the app. Python worker consumers use
   `packages/groovenet-python`; add a thin method and exact-request/contract tests
   there only if a worker consumes the endpoint (see its `CLAUDE.md`).
3. Wire it into the CLI and/or the MCP server.
4. Build in order: client → player → cli → mcp-server (`just build-packages`).

## Tests

```bash
npm test --workspace=packages/groovenet-client
```

`client.test.ts` mocks axios wholesale and asserts the exact request each method
issues. Coverage is 100%.

## Gotchas

- `checkPlaylist(id, { bpmJumpThreshold })` composes `getPlaylistTracks` and
  `batchGetTracks` (which does not promise playlist order, so it re-sorts by
  ref) and runs the pure `checkPlaylist(tracks)` from `playlistCheck.ts`. Refs
  the lookup cannot resolve come back in `unresolved_track_ids`. A vinyl side
  violation is any track whose side is lower, or whose position is lower on the
  same side, than the last well-placed track of its release; a violation does
  not move that marker, so one misplaced track is one finding. Keys are
  converted to Camelot; a missing or unrecognised key/BPM is listed, never
  guessed, and does not fail the check.
- `searchTracks` maps the API's `hits` to `tracks`; the wire shape and the
  returned shape differ.
- `generatePlaylist` tolerates the optimiser returning either an array or a
  keyed object, and normalises to an array.
- `startFingerprintIndex` returns as soon as the run is *queued*, not finished.
  Poll `getFingerprintIndexRun` until `complete`.
- `uploadSetRecording` sets `maxRedirects: 0` on purpose. Axios otherwise
  routes the body through follow-redirects, which buffers all of it to replay
  after a redirect — a whole set recording in memory. It also percent-encodes
  `X-Filename`, since headers are Latin-1.
- `hasSetRecording` treats `404` as an answer (`false`), not an error; that is
  how the CLI knows to upload.
- `createSetDerivation` can hand back an earlier equivalent run
  (`reused: true`) rather than starting one; `force: true` always starts one.
