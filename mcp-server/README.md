# Groovenet MCP Server

Model Context Protocol (MCP) server for the Groovenet DJ Playlist System. Allows Claude to interact with your music collection through natural language.

Uses the shared [`@groovenet/client`](../packages/groovenet-client) typed API client.

## Tools

### Tracks

| Tool                      | Description                                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `search_tracks`           | Search by title, artist, genre, BPM, key, or rating; each result carries `track_id`, `friend_id`, duration and `release_id` refs for `create_playlist`, `get_track_details` and `generate_ai_playlist` |
| `get_track_details`       | Full track info including audio analysis and mood scores                                                                                                                                               |
| `update_track`            | Update rating, notes, tags, or platform URLs                                                                                                                                                           |
| `get_missing_apple_music` | Find tracks without Apple Music URLs                                                                                                                                                                   |

### Albums

| Tool             | Description                                                 |
| ---------------- | ----------------------------------------------------------- |
| `search_albums`  | Search/list albums (sort by date, year, title, rating)      |
| `get_album`      | Album details + full track list                             |
| `update_album`   | Update rating, notes, condition, purchase price, library ID |
| `download_album` | Queue all missing tracks for download                       |

### Playlists

| Tool                   | Description                                                                                                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_playlists`       | List all playlists                                                                                                                                                                                                                                                                                                  |
| `get_playlist`         | Playlist tracks with full metadata                                                                                                                                                                                                                                                                                  |
| `create_playlist`      | Create a new playlist                                                                                                                                                                                                                                                                                               |
| `generate_ai_playlist` | Reorder tracks for smooth BPM/key/mood transitions. Takes `playlist: [{ track_id, friend_id? }]` (string `track_id`, not the numeric `id`) and optional `mode` (`genetic`, `greedy`, `cohesive_blocks`); BPM and other track data are looked up. Tracks need a BPM and audio-vibe embedding or the error lists them |
| `get_playlist_tracks`  | Raw track IDs for a playlist                                                                                                                                                                                                                                                                                        |

### Friends

| Tool          | Description                |
| ------------- | -------------------------- |
| `get_friends` | List friends and their IDs |
| `add_friend`  | Add a friend by username   |

### Genre discovery

| Tool                 | Description                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `get_similar_genres` | Ranked related genres to widen a playlist's genre choice or explain genre neighbourhoods |

`get_similar_genres` takes a required `slug` (a genre slug such as `cumbia`, or
an id) and an optional positive integer `limit` (server default: 20). Returns
the raw `{ genre, related }` API data as JSON text, including scores and
taxonomy, NPMI, and shared-album signals. Similarity uses every collection;
scores and signals can be absent for the taxonomy-sibling fallback.

### Player

Controls the local playback daemon (`groovenet player start --detach`) over its
Unix socket. These tools only work when the MCP server runs on the same machine
as the daemon, and they never start it.

| Tool                                                              | Description                                                                                                                          |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `player_status`                                                   | Status, current track (BPM, key), position/duration, volume and the queue with zero-based indexes and entry ids                      |
| `player_play`                                                     | Start or resume; optional `index` jumps to a queue position                                                                          |
| `player_pause`, `player_resume`, `player_next`, `player_previous` | Transport controls                                                                                                                   |
| `player_seek`                                                     | Seek to `seconds` in the current track                                                                                               |
| `player_volume`                                                   | Set `volume` (0-100)                                                                                                                 |
| `player_queue_list`                                               | The queue with indexes and entry ids                                                                                                 |
| `player_queue_add`                                                | Append tracks: exactly one of `query`, `playlist_id`, or `tracks` (`[{ track_id, friend_id? }]` refs, as printed by `search_tracks`) |
| `player_queue_remove`                                             | Remove an entry by `id` or zero-based `index`                                                                                        |
| `player_devices`, `player_select_device`                          | List audio outputs; switch to one by `device_id`                                                                                     |

Typical flow: `search_tracks` → `player_queue_add` with the refs →
`player_play`. With no daemon running (or a stale socket) every player tool
returns an error telling you to run `groovenet player start --detach`.

### External Search

| Tool                 | Description                                   |
| -------------------- | --------------------------------------------- |
| `search_apple_music` | Search Apple Music by title/artist/album/ISRC |
| `search_youtube`     | Search YouTube Music by title/artist          |

## Setup

From the repo root, install all workspace dependencies and build:

```bash
just bootstrap
just build-packages
```

Or build only the MCP server:

```bash
npm run build --workspace=mcp-server
```

Configure the API URL (create `mcp-server/.env`):

```
API_BASE=http://localhost:3000/api
# API_KEY=your-key-if-needed
```

| Variable                      | Description                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `API_BASE`                    | Groovenet API URL (default `http://localhost:3000/api`)                          |
| `API_KEY`                     | Optional API key                                                                 |
| `DEFAULT_FRIEND_ID`           | Friend used when a tool call omits `friend_id` (default `1`)                     |
| `GROOVENET_PLAYER_SOCKET`     | Player daemon socket (default `~/.groovenet/player/player.sock`, the CLI's path) |
| `GROOVENET_PLAYER_TIMEOUT_MS` | Per-request limit for player calls (default `15000`)                             |

## Usage with Claude Code

```bash
claude mcp add --transport stdio --scope project groovenet \
  -- node /path/to/dj-playlist/mcp-server/build/index.js
```

For remote access over Tailscale, set `API_BASE` to point at your server:

```bash
claude mcp add --transport stdio --scope user groovenet \
  -- env API_BASE=http://groovenet.tail1234.ts.net/api \
     node /path/to/dj-playlist/mcp-server/build/index.js
```

Verify:

```bash
claude mcp list
```

## Example Queries

- "Search for techno tracks between 128-132 BPM in A minor"
- "What genres are similar to cumbia so I can widen this playlist?"
- "Show me my highest rated albums"
- "What albums were added most recently?"
- "Download all missing tracks for album 1234567"
- "Create a playlist called 'Deep House Sunday' with my top rated tracks"
- "Generate an AI playlist starting with these tracks"
- "What tracks am I missing Apple Music URLs for?"
- "Search Apple Music for 'Plastikman - Spastik'"

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
