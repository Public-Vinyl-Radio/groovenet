# Groovenet MCP server

Connect an MCP client to the collection through the shared `@groovenet/client` API client.

See the [MCP guide](https://groovenet.publicvinylradio.com/docs/mcp/) for setup, environment settings, registration and tools.

## Architecture

```
Claude Code → MCP Server → @groovenet/client → Next.js API → PostgreSQL
```

All tools delegate to `GroovenetClient` methods — no API logic is duplicated in the MCP server.

## Adding New Tools

1. Add the method to `packages/groovenet-client/src/client.ts`
2. Rebuild the client: `npm run build --workspace=packages/groovenet-client`
3. Add the tool definition and handler case in `mcp-server/src/index.ts`
4. Rebuild: `npm run build --workspace=mcp-server`

## Tests

From the repo root:

```bash
npm run build --workspace=@groovenet/client
npm run build --workspace=@groovenet/player
npm --workspace=mcp-server test
```

Tests exercise the MCP stdio interface against a local HTTP fixture server. The player tests also run a fake daemon on a temp-dir Unix socket. Build `@groovenet/player` first: the server imports it.

## License

MIT
