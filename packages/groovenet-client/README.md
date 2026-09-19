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

### Config helpers

`loadConfig` / `saveConfig` read and write `~/.groovenet/config.json` (the same file the CLI uses):

```ts
import { loadConfig, saveConfig } from "@groovenet/client";

const cfg = loadConfig();
saveConfig({ ...cfg, api_base: "https://your-groovenet-host/api" });
```

## Exports

- `GroovenetClient` — the typed API client
- Domain types — `Track`, `Album`, `Playlist`, `Friend`, …
- Zod schemas — request/response validation
- `loadConfig` / `saveConfig` — config file helpers

> **Note:** Types are copied from the Groovenet Next.js app (`my-collection-search/src/types/track.ts`), which remains the source of truth.

## License

MIT
