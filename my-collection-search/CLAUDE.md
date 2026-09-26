# My Collection Search — Project Brief (for Claude Code)

## State Ownership
- See `docs/state-ownership.md` for the canonical state model.
- In short:
  - Zustand owns `Track`/`Album` entities
  - React Query owns request lifecycle, status, and lightweight query metadata
- See `docs/frontend-api-pattern.md` for the frontend API pattern (Zod/OpenAPI route contracts, typed `internalApi/*`, and shared `http` helpers instead of inline `fetch`).

## Overview
- Next.js app to browse, search, and manage a personal DJ track collection.
- Data sources: PostgreSQL (with pgvector) + PostgreSQL full-text + trigram search.
- Features: full-text search with infinite scroll, playlist views, track editing (rating, notes, links), audio analysis, AI helpers.

## Tech stack
- Framework: Next.js 16, React 19, TypeScript
- UI: Chakra UI v3
- Data: TanStack Query v5; search is Postgres full-text + trigram
- DB: Postgres (pgvector), migrations via node-pg-migrate
- Services: optional Essentia API (audio analysis) and GA service

## Run it
- Dev scripts (Node):
  - npm run dev — start Next.js
  - npm run build / npm start — production build/run
  - npm run migrate — run DB migrations (requires DATABASE_URL)
- Docker (recommended for DB + app):
  - docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
  - docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate
  - docker compose -f docker-compose.yml -f docker-compose.dev.yml up app
- Key env vars (see docker-compose.yml and .env):
  - DATABASE_URL
  - Apple/Discogs/OpenAI credentials as needed

## Structure (key folders)
- src/components — UI (e.g., SearchResults, TrackResult, PlaylistViewer)
- src/hooks — data hooks, mutations, cache helpers
- src/lib — queryKeys, helpers
- src/server/repositories — backend DB access (*Repository.ts files)
- src/server/services — backend-only services (DB, Redis, external APIs)
- src/services — frontend-only: http.ts, aiService.ts, backupService.ts, internalApi/
- src/providers - React context providers
- src/types — domain types (Track, etc.)
- migrations — node-pg-migrate scripts

## Data model highlights
- Track (src/types/track.ts):
  - star_rating?: number
  - bpm/key/danceability (string-ish), notes, tags, urls, duration_seconds, username

## Query keys (centralized)
- src/lib/queryKeys.ts
  - tracks: (args) => ["tracks", args]
    - args: { q?, filter?, limit?, mode?, page? }
  - playlistTrackIds: ["playlist", playlistId, "track-ids"]
  - playlistTracks: ["playlist-tracks", ...ids]
  - playlistCounts: ["playlistCounts", ids]

## Search results shape
- Infinite search returns pages of: { hits: Track[], estimatedTotalHits, offset, limit }
- Single-page mode uses the same page shape (no pages array).

## Caching and optimistic updates
- Refer to `docs/state-ownership.md` for current rules.
- Summary:
  - Query hooks fetch/hydrate into Zustand stores
  - Entity reads render from Zustand
  - React Query cache updates are for non-entity metadata/refs and invalidation

## UI notes
- TrackResult renders star rating as controlled value (reflects cache updates).
- SearchResults uses useSearchResults (infinite/page) and intersection observer for loadMore.
- Playlist views use playlistTrackIds + playlistTracks.

## How to extend safely
- Always use queryKeys helpers (don’t build keys by hand).
- When you change Track fields shown across lists, update useTracksCacheUpdater to patch all relevant caches.
- Prefer predicates targeting ["tracks", {…}] to avoid over-invalidation.
- For optimistic UI:
  - Build minimal patches with only defined fields
  - Cancel, snapshot, patch, rollback pattern

## Common tasks
- Add field to Track card: change TrackResult props, map field from Track
- Add new search filter: include in args for queryKeys.tracks, propagate to useSearchResults, backend query
- Patch track after action (e.g., rating): call updateTracksInCache({ track_id, star_rating })

## Gotchas
- defaultValue UI controls won’t reflect cache changes; use controlled value instead.
- Mixed cache shapes: infinite queries have pages[], single-page has { hits } — handle both.
- Keep patches narrow (avoid undefined) to prevent clobbering fields.

## Background work

`src/instrumentation.ts` is where anything periodic starts, once per server
process, guarded by a `globalThis` flag because Next can run server code in more
than one process:

- `startBackupScheduler()` — restic snapshots on a cron.
- `startIngestSweeper()` — retention for the vinyl ingest volume (#269).
- `startIngestReaper()` — writes off audio chunks stuck past their stall
  window so their file can be released.
- `startFingerprintBackfill()` — two passes keeping the reference index
  true (`fingerprintBackfillService.ts`, #303):
  - **missing**, every 30 min: tracks with audio but no fingerprint.
  - **changed**, hourly (`FINGERPRINT_VERIFY_INTERVAL_MINUTES`): every
    fingerprinted track, re-checked against its audio. `fingerprint-service`
    stats each file and hashes only those whose size or mtime moved, so this
    is a directory walk, not a 150 GB read — except once after deploy, when
    rows from before #303 are hashed to record their stats.

  The missing pass never looks at a track that already has a fingerprint, so
  without the changed pass, audio replaced behind an unchanged path — a
  re-rip — left the index matching audio that was gone. The fast path is
  immediate: `PATCH /api/tracks` queues a track's fingerprint whenever its
  `local_audio_url` gains or **changes** value (`trackFingerprintTrigger.ts`).
  Losing audio does not trigger: the fingerprint describes the record.
- `startPlayAggregation()` — turns recent confident detections into spin
  sessions (`playAggregationService.ts`), the backstop for #304. The fast path
  is immediate here too: `ingestLifecycleService.report()` aggregates a
  source's detections the moment it records a confident one. #279 built the
  grouping/dedup logic and neither trigger existed until #304 — detections
  landed in `play_detections` and nothing ever turned them into a spin.
  Both are bounded by `PLAY_AGGREGATION_LOOKBACK_MINUTES` (default 60); a
  backlog older than that needs `POST /api/spins/aggregate` (`since`,
  optional `source_id`) or `groovenet vinyl aggregate --since <date>`.

All of the above tick every 60s and decide internally whether it is time to
act, so each interval is configurable without restarting a timer.

The sweeper's rules live in `selectForDeletion`, which is pure and takes the
directory listing plus the matching `audio_ingests` rows. The one that matters:
a file whose record is `received` or `processing` is never deleted, whatever the
size pressure — deleting underneath a live job is how a half-file reaches the
matcher. The exception is age, which is the backstop for a worker that died and
left its record wedged. `GET /api/audio/ingest/retention` reports what the next
sweep would do without doing it.

## Audio ingest

`POST /api/audio/ingest` is where automatic vinyl play tracking starts (#275):
a listener device posts a ~15s chunk as `multipart/form-data`, and the app
validates it, stores it on the ingest volume and queues it for
`fingerprint-service`.

Three rules worth knowing before changing it:

- **The filename is never trusted.** `AudioProcessor` probes the media with
  ffprobe and everything — duration, rate, channels, codec, and the extension
  the file is stored under — comes from what it found. A device sending a JPEG
  called `chunk.wav` has to fail here, not three services downstream where the
  only symptom is an unexplainable decode error.
- **The upload is streamed to disk and the size limit enforced as it writes.**
  Buffering each 20 MB body to measure it is how several listeners at once
  takes the app down.
- **`(source_id, session_id, sequence)` is idempotent.** The Pi retries on
  network loss; a retry that already landed returns the original `ingest_id`
  rather than a second row and a second copy of the audio.

The `error` strings in a rejection are a contract, not prose. The device has no
screen and uses them to tell "this chunk is bad, drop it" from "retry later" —
don't reword them. `202` rather than `200` because what the audio *is* will not
be known for a second or two.

### Lifecycle

```
received ──claim──▶ processing ──report──▶ processed
   │                    │                     failed
   └────────────────────┴───────reap──────▶ failed
```

`fingerprint-service` drives the first two: it POSTs `.../claim` when it picks
a chunk up and `.../result` when it finishes. The claim exists only so a chunk
nothing ever collected can be told from one a worker took and died on — one
means restart the worker, the other means the worker is crashing on that audio.
Losing a claim costs diagnosis, not the result, so the worker treats it as
best-effort.

Three rules in `ingestLifecycleService`:

- **Every window produces a detection row, including the no-match ones.** A gap
  in matches is how #279 finds the boundary between one play and the next, so
  an empty `candidates` with `status: "processed"` is data, not an absence.
- **Detections are written before the status moves.** Dying between the two
  leaves an ingest in `processing` with rows already stored, which the reaper
  recovers; the other order leaves a `processed` ingest with no rows, which is
  indistinguishable from a genuine no-match.
- **A terminal state always releases the file**, even if the status transition
  lost a race. A chunk kept because of a race is one nothing will ever return
  for.

The reaper writes off anything stuck past `AUDIO_INGEST_STALL_MINUTES`. Its
status guard is what makes it safe beside a live worker — a chunk that finished
a millisecond before the deadline is not dragged back on top of its real
result. It also retires the age backstop the retention sweeper carries for
wedged records.

### Debugging it

```
GET /api/audio/ingest/recent    chunks and what became of them
GET /api/detections/recent      windows, with the track resolved
GET /api/audio/ingest/stats     index, queue, match rate, failures, spin backlog
```

Or `groovenet vinyl status | detections | ingests`, or the `/vinyl` page (gated
behind `ENABLE_DEVELOPER_TOOLS`, linked from `/developer`) — index status,
ingest health and a live-polling detection timeline, in the browser rather
than a terminal.

Two things to preserve if you touch these:

- **No-match windows are included by default.** `listRecent` LEFT JOINs the
  track; an inner join would silently drop every window that matched nothing,
  which is both the most common healthy state and the signal #279 uses to find
  the boundary between one play and the next.
- **`stats` reports the index first, and says `empty` outright.** An empty
  reference index makes every other number look healthy while nothing can
  match. It should not be inferable from a zero among other counters.

## Set derivation

A tracklist derived from a whole recorded set (#282), and a diff against the
playlist that was planned for it. The offline sibling of audio ingest: the same
reference index and matcher, a three-hour file instead of a 15 s chunk.

```
CLI ──HEAD/PUT /api/set-recordings/{sha256}──▶ set_recordings (volume + table)
CLI ──POST /api/set-derivations──────────────▶ set_derivations ──▶ fingerprint_set_queue
fingerprint-set-worker ──claim / result─────▶ set_derivations.windows
CLI ──GET /api/set-derivations/{id}?playlist_id=──▶ tracklist + unidentified + diff
```

**Recordings are content-addressed.** The CLI hashes the file locally and asks
`HEAD` first, so a recording the server holds is never sent twice. `PUT`
streams the raw body (not multipart — a 250 MB file must not be buffered),
hashing as it writes; only a body whose sha256 matches the path is renamed
into place, so a truncated upload can never become a recording. The stored
name is `{sha256}.{ext}`, the extension from ffprobe, never the filename.

**A run is the recording x engine x window settings — not the playlist.** The
worker stores raw per-window matches, which do not depend on any plan. The
tracklist, unidentified regions and diff are computed on read by
`setTracklist.ts` (pure), so one run answers for any playlist, and a playlist
corrected since reads back with a smaller diff. A repeat `POST` for the same
key returns the existing run (`200`, `reused: true`) unless it failed or has
sat unfinished past `SET_DERIVATION_STALL_MINUTES`; `force: true` always
starts a new one.

**Grouping is #279's rule**, via `groupWindows` in `playAggregationService`,
with one addition only this path turns on: `maxDriftSeconds` splits a run of
one track whose offset stops tracking the recording's clock (the record dropped
back to the start, or played twice). Each play reports `rate` — track seconds
per recording second, ~1.0 at pitch.

Drift only splits once **`driftConfirmWindows` (4) consecutive windows agree on
the new alignment**. Loop-based music matches a *repeat* of the same section
now and then — one or two windows jump, then the play carries on — and the
first cut of this split three tracks of #271's set into eleven plays. Two rules
hold that line; `derivePlays on the #271 set` pins both against the real
matcher output in `__tests__/fixtures/set-271-windows.json` (41 plays):

- The reference is the play's **established** alignment, followed window by
  window — not its first window.
- **An offset of 0 says nothing about alignment.** It is where the matcher
  clamps a window that began before the track did — a play's first window, a
  restart's needle drop — so it neither sets the reference nor counts as drift,
  and a confirmed restart takes those windows with it.

**The diff**, against `playlist_id` or `live_set_id`:

- *played as planned* — flagged `out_of_order` when outside the longest run
  that kept the plan's order. A record resumed after a gap is the same slot.
- *played instead of* — an unplanned play paired with an unplayed entry **on
  the same release**, nearest in the plan to where it was played. #271's six
  wrong playlist entries were all this shape.
- *played but not planned*, *planned but not played* — the rest. Planned
  entries carry `fingerprinted`: "not played" and "not in the index" otherwise
  look the same.

Unidentified stretches over 60 s are listed with the unfingerprinted tracks on
the releases played either side — usually the answer.

Two things to keep if you touch it:

- **`transitionStatus` passes "is terminal" as its own parameter.** Reusing
  `$2` in `CASE WHEN $2 IN (...)` makes Postgres deduce two types for it and
  refuse. `just set-derivation-test` runs these statements against a real
  database; a mocked `dbQuery` accepts them either way.
- **`writeHashed` is a `pipeline`, and must stay one.** Any stage failing —
  the file not opening, the size limit, the client leaving — tears the whole
  transfer down and cancels the request body. A hand-rolled loop here waited
  for a `drain` an errored file stream never emits: on a volume the app could
  not write, the handler stopped reading and never answered, and the CLI hung
  at ~12 MB. `pipeline` also waits for every stream to close, so a file
  opened mid-failure cannot outlive the caller's cleanup.
- **The app must own `/app/set-recordings`.** `entrypoint.sh` chowns it with
  the other writable volumes before dropping to `nextjs`; a new volume the app
  writes to needs adding there too.

## API reference

**Do not hand-maintain endpoint lists here.** The OpenAPI spec is generated from
`src/api-contract/` and is the accurate reference:

- **Swagger UI:** `/api/docs` on a running app; raw spec at `/api/openapi.json`
- **Regenerate the file:** `just generate-spec` → `openapi-generated.json`
- **Source:** `src/api-contract/routes.ts` (paths, OpenAPI schemas) and
  `src/api-contract/schemas.ts` (Zod schemas used at runtime)

Every documented response carries a realistic example. Those examples come from
`src/api-contract/exampleFromSchema.ts` plus the shared property vocabulary in
`propertyExamples.ts` — when you add an endpoint whose field names already
appear elsewhere, the examples fill themselves in. Add genuinely new recurring
names to `propertyExamples.ts` rather than to individual schemas.

Frontend calls go through typed wrappers in `src/services/internalApi/`, not
inline `fetch`. See `docs/frontend-api-pattern.md`.

Error shape: `http<T>()` throws `Error(message)` when `!res.ok`, taking the
message from the body's `error` or `message` field, else `HTTP <status>`.

## Conventions
- TS strict, path alias @/* (see tsconfig paths)
- Avoid any; keep types aligned with src/types/track.ts
- Minimal diffs; don’t reformat unrelated code

## Contact points
- If you need details about auth, missing envs, ask for DATABASE_URL and provider credentials.
- If a list doesn’t update after a mutation, check its query key and include it in useTracksCacheUpdater.

## Database schema (PostgreSQL)

Tables
- tracks
  - Primary key: (track_id, username) — compound PK
  - Columns:
    - id integer (legacy sequence id)
    - track_id varchar(255)
    - username text (kept for backwards compatibility)
    - friend_id integer NOT NULL (references friends.id)
    - title varchar(255) NOT NULL
    - artist varchar(255) NOT NULL
    - album varchar(255)
    - year varchar(10)
    - styles text[]
    - genres text[]
    - duration varchar(20)
    - position varchar(20)
    - discogs_url text
    - apple_music_url text
    -
    - youtube_url text
    - soundcloud_url text
    - album_thumbnail text
    - local_tags text
    - bpm real (nullable)
    - key varchar(255) (nullable)
    - danceability real
    - mood_happy real, mood_sad real, mood_relaxed real, mood_aggressive real
    - duration_seconds integer
    - notes text default ''
    - local_audio_url text
    - star_rating integer default 0
    - embedding vector(1536) (pgvector; optional)
  - Indexes/constraints:
    - tracks_compound_pk on (track_id, username)
    - Non-unique index on track_id (tracks_track_id_idx)
    -
    - Index on friend_id (idx_tracks_friend_id)
    - Foreign key: friend_id → friends.id

- playlists
  - id integer primary key (sequence playlists_id_seq)
  - name varchar(255) NOT NULL
  - created_at timestamp default current_timestamp

- playlist_tracks (join table)
  - playlist_id integer NOT NULL
  - track_id varchar(255) NOT NULL
  - friend_id integer NOT NULL (references friends.id)
  - position integer
  - Indexes/constraints:
    - Index on friend_id (idx_playlist_tracks_friend_id)
    - Foreign key: friend_id → friends.id
  - Note: No explicit PK; combination typically treated as unique in code

- friends
  - id serial primary key
  - username varchar(255) UNIQUE NOT NULL
  - added_at timestamp default current_timestamp

Extensions
- pgvector (vector type) enabled for tracks.embedding

Notes
- The compound PK allows the same track_id to exist for multiple users.
- friend_id columns added to normalize references to friends table (replacing username strings).
- username columns kept temporarily for backwards compatibility during transition.
- PostgreSQL is the source of truth for both storage and search.

Migration Scripts
- migrations/1737641200000_add_friend_id_columns.js — adds friend_id to tracks and playlist_tracks
- scripts/validate-friend-id-migration.js — validates data integrity after migration

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
