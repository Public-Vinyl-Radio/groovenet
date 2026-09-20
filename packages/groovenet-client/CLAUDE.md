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
  index.ts     re-exports all four
```

```ts
const client = new GroovenetClient({ baseUrl, apiKey, insecureTls });
```

`insecureTls` attaches an https agent with `rejectUnauthorized: false`, for
self-signed homelab certs.

Every method funnels through one private `request()`, which unwraps axios errors
into `Error("API Error: …")`, preferring the response body's `error` field, then
`message`, then the axios message.

## Types are copied, not shared

`my-collection-search/src/types/track.ts` is the source of truth. `types.ts`
here is a **copy** — when the app's types change, update this file too. There is
no build-time link that will catch the drift.

## Adding an endpoint

1. Add the method to `client.ts`.
2. Copy any new types from the app.
3. Wire it into the CLI and/or the MCP server.
4. Build in order: client → cli → mcp-server (`just build-packages`).

## Tests

```bash
npm test --workspace=packages/groovenet-client      # 62 tests
```

`client.test.ts` mocks axios wholesale and asserts the exact request each method
issues. Coverage is 100%.

## Gotchas

- `searchTracks` maps the API's `hits` to `tracks`; the wire shape and the
  returned shape differ.
- `generatePlaylist` tolerates the optimiser returning either an array or a
  keyed object, and normalises to an array.
