# mcp-server

Exposes the collection to Claude Code over the Model Context Protocol. A thin
adapter — all HTTP work goes through `@groovenet/client`, with no bespoke calls.

## Configuration

Environment only; it runs as a daemon and does **not** read
`~/.groovenet/config.json` the way the CLI does.

|                               |                                                                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `API_BASE`                    | required                                                                                                                                            |
| `API_KEY`                     | optional                                                                                                                                            |
| `DEFAULT_FRIEND_ID`           | optional                                                                                                                                            |
| `SENTRY_DSN`                  | optional; enables exception reporting                                                                                                               |
| `SENTRY_RELEASE`              | optional; release label (defaults to the root package version)                                                                                      |
| `GROOVENET_PLAYER_SOCKET`     | optional; player daemon socket, default `~/.groovenet/player/player.sock` (from `defaultPlayerPaths()` in `@groovenet/player`, shared with the CLI) |
| `GROOVENET_PLAYER_TIMEOUT_MS` | optional; per-request limit for player calls, default 15000 (tests shorten it)                                                                      |

Register it:

```bash
claude mcp add --transport stdio --scope project groovenet \
  -- node /path/to/mcp-server/build/index.js
```

## Tools

Tools, grouped:

- **tracks** — `search_tracks`, `get_track_details`, `update_track`,
  `get_missing_apple_music`
- **albums** — `search_albums`, `get_album`, `update_album`, `download_album`
- **playlists** — `list_playlists`, `get_playlist`, `get_playlist_tracks`,
  `check_playlist`, `create_playlist`, `generate_ai_playlist`
- **friends** — `get_friends`, `add_friend`
- **discovery** — `get_recommendations`, `find_similar_identity`,
  `find_similar_vibe`, `get_similar_genres`
- **external** — `search_apple_music`, `search_youtube`
- **records** — `log_record_action`, `list_record_care`,
  `get_record_care_summary`, `get_record_copies` (with history),
  `void_record_action`
- **player** — `player_status`, `player_play`, `player_pause`, `player_resume`,
  `player_next`, `player_previous`, `player_seek`, `player_volume`,
  `player_queue_list`, `player_queue_add`, `player_queue_remove`,
  `player_devices`, `player_select_device`

The player tools (`src/player.ts`) drive the local daemon through
`PlayerControlClient` from `@groovenet/player`; the protocol is not
reimplemented here. Each call opens a connection, sends its request(s) and
closes it (also on errors and timeouts). They stay one tool per action, not an
`action` enum, so a user can allow read-only `player_status`/`player_queue_list`
without allowing transport or queue changes. A missing daemon or stale socket is
reported as an error saying to run `groovenet player start --detach`; the server
never starts a daemon. `player_queue_add` with `tracks` takes the same refs as
`generate_ai_playlist` and hydrates them with `batchGetTracks` (shared
`hydrateTrackRefs`) before sending `queue.addTrack`. Indexes are zero-based, as
in the daemon protocol. These tools only work when the server runs on the
daemon's machine.

`generate_ai_playlist` takes refs (`{ track_id, friend_id? }`), not track
objects: the handler hydrates them with `batchGetTracks` because the route reads
BPM from the request body. An item with `id` but no `track_id` is rejected,
never mapped — `id` is the numeric database ID, not the track ID. Server
`details`/`invalid` come through in the error via `GroovenetClient`.

## Build

```bash
just build-packages     # client → player → cli → mcp-server, in that order
```

The client and player must be built first; this package imports their compiled output.

## Gotchas

- ESLint uses the shared Node config in the repository root; CI and pre-commit
  both cover this package.
- Tool descriptions are what the model sees. Treat them as part of the
  interface, not as comments.
