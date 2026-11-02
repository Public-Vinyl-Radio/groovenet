---
title: Set recordings
description: Turn a recording of a set into a tracklist and see how it differed from the plan.
sidebar:
  order: 4
---

Play a set, record it, and GrooveNet can tell you what you played. It matches the recording against your [fingerprint index](/docs/vinyl-tracking/fingerprint-index/), builds a timestamped tracklist, and compares it with the playlist you planned. Then you can correct the playlist so it records what actually happened.

This works from the command line. There is no screen for it in the web app yet.

## What you need

- A recording of the set as a single audio file, up to 2 GiB by default (`SET_RECORDING_MAX_BYTES`).
- A built [reference index](/docs/vinyl-tracking/fingerprint-index/). The recording is matched against the same index as live listening, so a record that isn't in it can't be found.
- The stack's `fingerprint-set-worker`, which is part of the standard Compose stack. It reads recordings from its own volume, `set_recordings`, so a long decode never delays a live listening window. Point `SET_RECORDINGS_MOUNT` in `.env` at a folder to keep recordings somewhere of your choosing.
- The [CLI configured](/docs/cli/) against your server.

## Derive a tracklist

```bash
groovenet sets derive ~/sets/2026-08-15.mp3 --playlist 176
```

The command hashes the file on your machine and uploads it only if the server doesn't already have it. The worker then matches every 15-second window of the recording, and the app groups matching windows into plays. Add `--no-wait` to start the run and come back later. Running the same command again finds the earlier result unless you pass `--force`.

Pass `--playlist <id>` to compare against a playlist, or `--live-set <id>` to compare against a live set and list the recording with it. Without either, you get the tracklist and no comparison.

## Read the result

```
inner-signals.mp3 — 40 plays, 87.5% of 3:04:04 identified (chromaprint 1)

  ✓ 0:00:15  0:06:44  Herbie Mann — Soul Beat Momma [1234-A1]
  ⇄ 0:12:44  0:16:58  Cuco — Lovetripper [13916746-A6]  instead of A5 Feelings
  ? 0:16:58  0:19:28  unidentified (2m30s)
  ↕ 0:48:41  0:50:56  Elia y Elizabeth — Hay Que Vivir La Vida [6279169-B4]  out of order
```

Each line is a play with its start and end times in the set. The marks say how it compares with the plan:

| Mark | Meaning                                                    |
| ---- | ---------------------------------------------------------- |
| ✓    | Played as planned.                                         |
| ⇄    | A different track from the planned one on the same record. |
| +    | Played, but not in the plan.                               |
| ↕    | Planned, but played in a different order.                  |
| ?    | A stretch nothing matched, with its length.                |

The summary underneath counts the plays as planned, played instead, not planned, and planned but not played. `groovenet sets show <derivation-id> --playlist 176` shows a result again later.

An unidentified stretch is not always an error. The usual cause is a record with no reference audio in the index. Index it, then run again with `--force`.

## Correct the playlist

```bash
groovenet sets review <derivation-id> --playlist 176
```

Review goes through each difference in turn. For each, answer `y` to accept, `n` or Enter to skip, or `q` to stop. An accepted change replaces a planned track with the one you played, inserts a track you played that wasn't planned, or removes one you never played. Nothing is written until you've seen a summary and confirmed, and `--dry-run` shows the corrected playlist without saving it. `groovenet sets derive ... --review` runs the review straight after deriving.

To log the plays as spins, use `groovenet playlists log-spins <playlist> --derivation <derivation-id>`.

The full option list is in the [`groovenet sets` section of the CLI guide](/docs/cli/#sets). For the live version, see [detections and spins](/docs/vinyl-tracking/spins/).
