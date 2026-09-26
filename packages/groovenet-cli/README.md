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
groovenet fingerprint-library             # index reference audio for matching
groovenet sets derive set.mp3 --playlist 176  # tracklist + diff from a set recording
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
| `fingerprint-library` | Build the reference fingerprint index used to recognise vinyl as it plays |
| `sets` | Derive a corrected tracklist from a recording of a set, and diff it against the plan |

### sets

Turns a recording of a set into a timestamped tracklist, and — given the
playlist you planned — shows how the night differed from the plan. The file is
hashed locally and uploaded only if the server does not already have it.

```bash
groovenet sets derive ~/sets/2026-08-15.mp3 --playlist 176
groovenet sets derive set.mp3 --live-set 12       # also attach it to the live set
groovenet sets derive set.mp3 --force             # re-run even if done before
groovenet sets show <derivation-id> --playlist 176
```

Example output (abridged):

```
inner-signals.mp3 — 40 plays, 87.5% of 3:04:04 identified (chromaprint 1)

  ✓ 0:00:15  0:06:44  Herbie Mann — Soul Beat Momma [1234-A1]
  ⇄ 0:12:44  0:16:58  Cuco — Lovetripper [13916746-A6]  instead of A5 Feelings
  ? 0:16:58  0:19:28  unidentified (2m30s)
  ↕ 0:48:41  0:50:56  Elia y Elizabeth — Hay Que Vivir La Vida [6279169-B4]  out of order

Against playlist 176
  32 as planned · 6 played instead · 0 not planned · 2 planned but not played
```

### fingerprint-library

Fingerprints the library's reference audio so live vinyl playback can be
recognised against it. Safe to re-run: each track's audio is hashed and skipped
when nothing has changed.

```bash
groovenet fingerprint-library                  # only tracks not yet indexed
groovenet fingerprint-library --changed        # re-check already-indexed files
groovenet fingerprint-library --all --force    # regenerate everything
groovenet fingerprint-library --track 12345-1  # one track
groovenet fingerprint-library --release 12345  # one release
groovenet fingerprint-library --no-wait        # queue it and return
```

```
Indexing missing — chromaprint 1
  3653 queued, 241 without reference audio
  ✗ 12345-2: ffmpeg exited 1: Invalid data found when processing input
  ✓ 3412 indexed   ⤼ 0 skipped   ✗ 2 failed   – 241 no audio
```

Tracks with no local audio are counted, not failed — only the part of the
library you have downloaded can be fingerprinted. Exits 1 if any track failed.

## Related

- [`@groovenet/client`](https://www.npmjs.com/package/@groovenet/client) — the typed API client this CLI is built on.

## License

MIT
