# mcp-server

Exposes the collection to Claude Code over the Model Context Protocol. A thin
adapter — all HTTP work goes through `@groovenet/client`, with no bespoke calls.

## Configuration

Environment only; it runs as a daemon and does **not** read
`~/.groovenet/config.json` the way the CLI does.

| | |
| --- | --- |
| `API_BASE` | required |
| `API_KEY` | optional |
| `DEFAULT_FRIEND_ID` | optional |

Register it:

```bash
claude mcp add --transport stdio --scope project groovenet \
  -- node /path/to/mcp-server/build/index.js
```

## Tools

20 tools, grouped:

- **tracks** — `search_tracks`, `get_track_details`, `update_track`,
  `get_missing_apple_music`
- **albums** — `search_albums`, `get_album`, `update_album`, `download_album`
- **playlists** — `list_playlists`, `get_playlist`, `get_playlist_tracks`,
  `create_playlist`, `generate_ai_playlist`
- **friends** — `get_friends`, `add_friend`
- **discovery** — `get_recommendations`, `find_similar_identity`,
  `find_similar_vibe`
- **external** — `search_apple_music`, `search_youtube`

## Build

```bash
just build-packages     # client → cli → mcp-server, in that order
```

The client must be built first; this package imports its compiled output.

## Gotchas

- There is no eslint config here, so neither CI nor pre-commit lints it. See
  issue #253.
- Tool descriptions are what the model sees. Treat them as part of the
  interface, not as comments.
