# @groovenet/cli

Command-line interface for managing your [Groovenet](https://github.com/Public-Vinyl-Radio/groovenet) DJ collection — search tracks and albums, manage playlists and friends, and control server-side playback, all from the terminal.

## Install

```bash
npm install -g @groovenet/cli
```

Requires **Node.js ≥ 22.12**. The binary is `groovenet`.

## Configure

Point the CLI at your Groovenet API (stored in `~/.groovenet/config.json`):

```bash
groovenet config set api_base https://your-groovenet-host/api
groovenet config set api_key <token>   # if your instance requires auth
```

## Usage

```bash
groovenet tracks search "miles davis"     # search tracks
groovenet albums search "kind of blue"    # browse albums
groovenet playlists list                  # list playlists
groovenet friends list                    # manage the friends system
groovenet play <track-id>                 # play a track via MPD on the server
```

Every command accepts `--json` for machine-readable output:

```bash
groovenet tracks search "bpm:120" --json | jq '.[].track_id'
```

Run `groovenet --help` (or `groovenet <command> --help`) for the full command reference.

## Commands

| Command | Description |
| --- | --- |
| `config` | Manage CLI configuration (`api_base`, `api_key`) |
| `tracks` | Search and manage tracks |
| `albums` | Browse and manage albums |
| `playlists` | Manage playlists |
| `friends` | Manage the friends system |
| `play` / `pause` / `stop` / `now-playing` | Control server-side MPD playback |

## Related

- [`@groovenet/client`](https://www.npmjs.com/package/@groovenet/client) — the typed API client this CLI is built on.

## License

MIT
