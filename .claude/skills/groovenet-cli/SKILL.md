---
name: groovenet-cli
description: Query and manage a Groovenet DJ vinyl collection from the terminal — search tracks and albums, read and edit metadata, build and optimise playlists, find similar tracks by genre/era or by audio vibe, and queue album downloads. Use whenever the user asks about their record collection, their tracks, albums, playlists or crates, wants recommendations or a setlist built, or mentions the `groovenet` command.
---

# Groovenet CLI

`groovenet` talks to the user's collection over HTTP. It reads its config from
`~/.groovenet/config.json`, so no credentials belong in commands.

## Always use `--json`

Every command supports it. Default output is an ANSI-coloured table that is
painful to parse and easy to misread.

```bash
groovenet tracks search "deep house" --limit 5 --json
```

Pipe through `jq` to keep output small — track records are wide, and dumping a
20-track search in full wastes context. Redirect stderr away rather than merging
it with `2>&1`, or error text lands in the pipe and `jq` fails on it:

```bash
groovenet tracks search "house" --limit 20 --json 2>/dev/null \
  | jq -r '.tracks[] | "\(.track_id)  \(.artist) — \(.title)  \(.bpm // "-")bpm"'
```

## Check config before the first call

```bash
groovenet config show
```

If `api_base` is unset, the user needs `groovenet config set api_base <url>`.
Don't guess a URL. `default_friend_id` is the collection owner; most commands
take `--friend-id` to override it.

## Commands

### Tracks

```bash
groovenet tracks search <query> [--bpm-min N] [--bpm-max N] [--key K]
                                [--rating N] [--limit N] [--json]
groovenet tracks show <track-id> [--friend-id N] [--json]
groovenet tracks update <track-id> [--rating N] [--notes TEXT] [--tags a,b]
                                   [--apple-url U] [--youtube-url U]
                                   [--spotify-url U] [--soundcloud-url U]
groovenet tracks missing-apple-music [--page N] [--page-size N] [--json]
groovenet tracks deleted [--friend-id N] [--limit N] [--offset N] [--json]
groovenet tracks restore <track-id> [--friend-id N]
```

Track ids look like `1587760-B3` — the Discogs release id plus the vinyl
position. They are not numeric.

### Discovery

```bash
groovenet tracks recommend <track-id> [--limit N] [--json]
groovenet tracks similar-identity <track-id> [--limit N] [--era 1970s]
                                             [--country us] [--tags a,b] [--json]
groovenet tracks similar-vibe <track-id> [--limit N] [--json]
```

Pick deliberately — they answer different questions:

| | use for |
| --- | --- |
| `similar-identity` | same scene: genre, era, label, style, tags |
| `similar-vibe` | same feel: BPM, key, mood, danceability |
| `recommend` | both embeddings combined |

"Something that sounds like this" is `similar-vibe`. "More like this era or
genre" is `similar-identity`. When unsure, `recommend`.

All three need the **seed track to have embeddings**, and many tracks don't —
roughly half, in practice. You get an explicit error, not an empty result:

```
Error: API Error: Seed track has no embeddings
```

That's a data state, not a bug: the track hasn't been vectorised yet. Having a
BPM is not a proxy for having embeddings — they're populated separately. If a
seed fails, try a neighbouring track rather than reporting the feature broken.

### Albums

```bash
groovenet albums list [query] [--sort S] [--limit N] [--offset N] [--json]
groovenet albums show <release-id> [--json]
groovenet albums update <release-id> [--rating N] [--notes TEXT]
                                     [--price N] [--condition "VG+"]
groovenet albums download <release-id>
```

`--sort` takes `created_at:desc`, `date_added:desc`, `year:desc`, `title:asc`
or `album_rating:desc`.

`albums download` **queues background work** — it returns once the jobs are
enqueued, not when audio has been fetched. Say so rather than implying the
download finished.

### Playlists

```bash
groovenet playlists list [--json]
groovenet playlists show <id> [--json]
groovenet playlists create <name>
groovenet playlists generate <id> [--json]
```

`generate` reorders an existing playlist for smooth transitions using BPM and
key compatibility. It needs the playlist to exist first, and its tracks need
BPM and embeddings — tracks missing either are reported as rejected rather than
silently dropped.

### Friends

```bash
groovenet friends list [--json]
groovenet friends add <username>
```

"Friends" are the collection owners whose libraries are indexed — the unit that
`--friend-id` selects.

## Recipes

**Build a setlist from a seed track**

```bash
groovenet tracks similar-vibe 10213279-B2 --limit 12 --json 2>/dev/null \
  | jq -r '.tracks[] | "\(.track_id)\t\(.artist) — \(.title)\t\(.bpm)"'
groovenet playlists create "Friday warmup"
# add tracks via the app, then:
groovenet playlists generate <new-id> --json
```

**Find gaps in metadata**

```bash
groovenet tracks missing-apple-music --page-size 100 --json 2>/dev/null \
  | jq -r '.tracks[] | "\(.track_id)  \(.artist) — \(.title)"'
```

**Tempo-bounded crate dig**

```bash
groovenet tracks search "" --bpm-min 118 --bpm-max 126 --rating 4 --limit 30 --json
```

## Working carefully

- `tracks update` and `albums update` **write to the user's collection**.
  Confirm before changing ratings or notes in bulk, and never invent a rating.
- `albums download` starts real downloads. Confirm first.
- A search returning nothing is worth reporting as such — don't broaden the
  query and present the results as if they matched what was asked.
- Errors surface as `API Error: <message>` from the server. Report the message
  rather than retrying blindly; a 404 usually means a wrong `--friend-id`.

## If the binary is missing

It is published as `@groovenet/cli`. In this repo, build and run it directly:

```bash
npm run build --workspace=packages/groovenet-client
npm run build --workspace=packages/groovenet-cli
node packages/groovenet-cli/build/bin/groovenet.js --help
```
