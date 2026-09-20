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
- Data: TanStack Query v5, PostgreSQL search
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

## Services/endpoints used (client)
- /api/tracks/update (PATCH) — saveTrack
- /api/tracks/batch (POST) — fetchTracksByIds
- /api/tracks/:id (GET) — fetchTrackById
- /api/tracks/playlist_counts (POST)
- /api/tracks/analyze, /api/tracks/upload, /api/ai/track-metadata — optional features

## API contracts (client → server)

Tracks
- POST /api/tracks/batch
  - body: { track_ids: string[] }
  - res: Track[]
  - 400 if invalid body
- PATCH /api/tracks/update
  - body: TrackEditFormProps (fields to update)
  - res: Track (updated)
- POST /api/tracks/vectorize
  - body: { track_id: string, username: string }
  - res: void
- POST /api/tracks/analyze
  - body: { track_id: string, apple_music_url?, youtube_url?, soundcloud_url?,  }
  - res: { rhythm?, tonal?, metadata?, ... }
- POST /api/tracks/upload (multipart/form-data)
  - body: file, track_id
  - res: { analysis: AnalyzeResponse, ... }
- GET /api/tracks/:id?username=...
  - res: Track
- POST /api/tracks/bulk-notes
  - body: { updates: Array<{ track_id: string, notes?, local_tags?, ... }> }
  - res: { updated?: number }
- POST /api/tracks/playlist_counts
  - body: { track_ids: string[] }
  - res: Record<string, number>
- GET /api/tracks/missing-apple-music?page=&pageSize=&username?
  - res: { tracks: Track[], total: number }

AI
- POST /api/ai/youtube-music-search
  - body: { title?, artist? }
  - res: { results: YoutubeVideo[] }
- POST /api/ai/apple-music-search
  - body: { title?, artist?, album?, isrc? }
  - res: { results: AppleMusicResult[] }
- POST /api/ai/apple-music-search
  - body: { title?, artist? }
  - res: { results: AppleMusicTrackSearchItem[] }
  - 401 triggers redirect to /api/ai/apple-music-search

Playlists
- POST /api/playlists
  - body: { name: string, tracks: string[] }
  - res: Response (JSON varies)
- GET /api/playlists
  - res: any (list of playlists)
- GET /api/playlists/:id/tracks
  - res: { track_ids: string[] }
- POST /api/playlists/genetic
  - body: { playlist: Track[] }
  - res: Track[] (normalized from { result })
- DELETE /api/playlists?id=number
  - res: 204 on success

Friends
- GET /api/friends?showCurrentUser=&showCurrentUser=
  - res: { friends: string[] }
- POST /api/friends
  - body: { username: string }
  - res: any
- DELETE /api/friends?username=
  - res: any
  - also supports SSE via DELETE with streaming helper

Streaming integration
- GET /api/albums/[releaseId]/download?friend_id=
  - 401 → redirect to /api/ai/apple-music-search
  - res: { newReleases: string[], alreadyHave: string[], total? }

Backups
- POST /api/backup → { message }
- GET /api/backups → { files: string[] }
- POST /api/restore (multipart) → { message? }

Error shape & status codes
- http<T>() throws Error(message) when !res.ok.
  - Message taken from { error } or { message } JSON field, else `HTTP <status>`.
  - Expect 400 for bad inputs, 401 for , 500 for server errors.

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
