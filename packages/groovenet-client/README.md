# @groovenet/client

Typed API client for the [Groovenet](https://github.com/Public-Vinyl-Radio/groovenet) DJ collection system. Provides a single `GroovenetClient` plus domain types (`Track`, `Album`, `Playlist`, `Friend`) and Zod schemas, shared by the [`@groovenet/cli`](https://www.npmjs.com/package/@groovenet/cli) and the Groovenet MCP server.

## Install

```bash
npm install @groovenet/client
```

ESM-only. Requires **Node.js ≥ 22**.

## Usage

```ts
import { GroovenetClient } from "@groovenet/client";

const client = new GroovenetClient({
  apiBase: "https://your-groovenet-host",
  apiKey: process.env.GROOVENET_API_KEY, // if your instance requires auth
});

const tracks = await client.searchTracks({ q: "miles davis", limit: 20 });
const album = await client.getAlbum(releaseId, friendId);
```

### Trusting a private CA

Pass `caCert`, a path to a PEM CA bundle (e.g. Caddy's local `root.crt`), to verify
an internal HTTPS host against it; verification is never disabled. An unreadable
path throws an error naming it. `NODE_EXTRA_CA_CERTS` also works with no code.

```ts
const client = new GroovenetClient({ baseUrl, caCert: "/path/to/root.crt" });
```

`loadConfig()` returns `ca_cert` from the config, overridden by `GROOVENET_CA_CERT`.
The old `insecureTls` option and `insecure_tls` config key were removed; a config
that still sets `insecure_tls: true` makes `loadConfig()` throw.

### Config helpers

`loadConfig` / `saveConfig` read and write `~/.groovenet/config.json` (the same file the CLI uses):

```ts
import { loadConfig, saveConfig } from "@groovenet/client";

const cfg = loadConfig();
saveConfig({ ...cfg, api_base: "https://your-groovenet-host/api" });
```

### Similar genres

```ts
const { genre, related } = await client.getSimilarGenres("cumbia", { limit: 5 });
```

Accepts a genre slug or id and returns the raw `{ genre, related }` API response.
Related genres carry a score and signals (`taxonomy`, `npmi`, `shared_albums`)
when a stored ranking is available; the taxonomy-sibling fallback omits those
fields. Similarity uses every collection. Omitting `limit` uses the server's
default of 20; fewer results may be available.

## Exports

- `GroovenetClient` — the typed API client
- Domain types — `Track`, `Album`, `Playlist`, `Friend`, …
- Zod schemas — request/response validation
- `loadConfig` / `saveConfig` — config file helpers

> **Note:** Types are copied from the Groovenet Next.js app (`my-collection-search/src/types/track.ts`), which remains the source of truth.

## License

MIT
