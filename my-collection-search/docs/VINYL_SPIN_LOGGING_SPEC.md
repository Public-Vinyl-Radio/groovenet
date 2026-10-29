# Vinyl Spin Logging - Implementation Spec

## Status

- Owner: unassigned
- Status: in progress
- Tracking method: update the checklist in this document as implementation lands
- Source of truth: this file

## Implemented So Far

The following are implemented in code:

- database tables and indexes for `spin_sessions`, `spin_session_selections`, and `track_spin_events`
- repository layer for session persistence and track-event persistence
- transactional service layer for create/list/delete spin session flows
- normalized album side grouping logic used by both the spin service and album page
- route handlers for:
  - `GET /api/albums/{releaseId}/playable-structure`
  - `GET /api/spins`
  - `POST /api/spins`
  - `DELETE /api/spins/{id}`
- Zod schemas and explicit OpenAPI contract entries for the above routes
- internal API client methods for spins and album playable structure
- query keys and hooks for spins
- route, service, and architecture tests for spin logging
- `npm run openapi:check` verification in this environment
- album-page UI for:
  - logging spins by sides
  - logging spins by tracks
  - viewing recent album spin history
  - deleting logged spin sessions
- global spins page UI for:
  - recent spin history across albums
  - most-played vinyl tracks from `track_spin_events`
  - deleting logged spin sessions from the history view

Not yet implemented:

- shared TS client support in `packages/groovenet-client`
- regenerated Python client from OpenAPI
- decision on whether spins belong in the mobile OpenAPI subset

## Problem Statement

The app needs a manual logging system for **physical vinyl listening**, not app playback. A user should be able to log that they spun:

- individual tracks from an LP
- one or more sides of an LP
- an entire album, represented by selecting all sides in a single session

This should create durable history that can power:

- recent spin history
- per-album spin history
- per-track spin history
- "most played tracks"

This feature must remain separate from the in-app audio player and playback telemetry.

## Goals

- Support manual logging of vinyl LP spin sessions.
- Treat a spin as a **single session** with one timestamp and one album context.
- Allow logging by side or by explicit track list.
- Expand each session into canonical track-level events for analytics.
- Expose the feature through documented OpenAPI-backed endpoints.
- Keep the design extensible for future manual gig/set logging.

## Non-Goals

- No automatic logging from app playback.
- No integration with Media Session, MPD, AVPlayer, or local audio playback.
- No playlist/set logging in phase 1.
- No counters stored directly on `albums` or `tracks`.
- No inference that a full album was played by summing separate sessions across time.

## Core Decisions

### 1. Manual physical-media subsystem

This is a separate domain from playback. The meaning of a row is:

> "The user manually logged that they played this vinyl record/side/track."

### 2. Session is the primary user action

A user action creates one `spin_session`. That session may cover:

- one or more sides
- one or more explicit tracks

### 3. Track-level events are the analytics source of truth

Every session should expand into track-level rows so analytics stay simple. This avoids expensive repeated expansion during queries and keeps future "most played tracks" work straightforward.

### 4. "Entire album" is derived, not stored

If one session covers all normalized sides of an album, the API may report it as a full album spin. No explicit `entire_album` flag is needed.

### 5. Album-only for phase 1

Phase 1 only supports vinyl album logging. Future playlist/gig logging should reuse the same shape conceptually, but should not be implemented in this slice.

## User Stories

### Phase 1

- As a DJ, I can open an album and log that I spun Side A.
- As a DJ, I can log that I spun Sides C and D of a 2xLP.
- As a DJ, I can log that I spun only tracks A2 and B1.
- As a DJ, I can see a recent history of vinyl spins.
- As a DJ, I can later ask which tracks I physically played the most.

### Future

- As a DJ, I can manually log tracks I played from a gig playlist or crate.

## Domain Model

### Table: `spin_sessions`

One row per manual vinyl spin session.

Suggested columns:

- `id` bigint primary key
- `friend_id` integer not null references `friends(id)` on delete cascade
- `release_id` varchar(255) not null
- `medium` varchar(20) not null default `'vinyl'`
- `selection_mode` varchar(20) not null
  - allowed values: `sides`, `tracks`
- `played_at` timestamptz not null
- `note` text null
- `context_type` varchar(50) null
  - examples: `home`, `gig`, `radio`, `practice`
- `created_at` timestamptz not null default `now()`
- `updated_at` timestamptz not null default `now()`

Notes:

- `medium` is explicit even though phase 1 only uses vinyl. This keeps the meaning clear.
- `selection_mode` documents whether the user selected sides or tracks.

### Table: `spin_session_selections`

Stores exactly what the user selected when logging the session.

Suggested columns:

- `id` bigint primary key
- `session_id` bigint not null references `spin_sessions(id)` on delete cascade
- `ordinal` integer not null
- `selection_type` varchar(20) not null
  - allowed values: `side`, `track`
- `side_key` varchar(32) null
- `track_id` varchar(255) null
- `friend_id` integer null references `friends(id)` on delete cascade
- `position_snapshot` varchar(50) null
- `created_at` timestamptz not null default `now()`

Constraints:

- if `selection_type = 'side'`, `side_key` must be non-null and `track_id` null
- if `selection_type = 'track'`, `track_id` must be non-null

Notes:

- This preserves the exact user intent, which is useful for UI fidelity and debugging.

### Table: `track_spin_events`

Canonical expanded track-level rows for analytics.

Suggested columns:

- `id` bigint primary key
- `session_id` bigint not null references `spin_sessions(id)` on delete cascade
- `friend_id` integer not null references `friends(id)` on delete cascade
- `release_id` varchar(255) not null
- `track_id` varchar(255) not null
- `played_at` timestamptz not null
- `ordinal` integer not null
- `side_key` varchar(32) null
- `position_snapshot` varchar(50) null
- `title_snapshot` varchar(255) not null
- `artist_snapshot` varchar(255) not null
- `album_snapshot` varchar(255) not null
- `created_at` timestamptz not null default `now()`

Notes:

- Snapshot columns protect analytics/history if track metadata changes later.
- Do not store aggregate counters in this phase.

## Indexes

Create at minimum:

- `spin_sessions(friend_id, played_at desc)`
- `spin_sessions(friend_id, release_id, played_at desc)`
- `track_spin_events(friend_id, track_id, played_at desc)`
- `track_spin_events(friend_id, release_id, played_at desc)`
- `track_spin_events(session_id, ordinal)`
- unique index on `spin_session_selections(session_id, ordinal)`

## Side Normalization

Current helper: `src/lib/albumTrackPosition.ts`

Current limitation:

- it handles simple positions like `A1` and `B2`
- it does not robustly normalize multi-disc or non-trivial Discogs position formats

Phase 1 needs a stronger normalization helper that returns a **stable side key** used by both API responses and spin logging.

### Required behavior

- group tracks into stable ordered sides for a given album
- preserve original Discogs ordering
- support common formats such as:
  - `A1`, `A2`, `B1`
  - `C1`, `D1` for 2xLP
  - `AA1`, `BB1`
  - `1-1`, `1-2`, `2-1`, `2-2`
  - letter + suffix variants where feasible
- when ambiguous, fall back to deterministic grouping rather than guessing silently

Current implemented fallback behavior:

- `A1`, `B1`, `C1`, `D1` map to `Side A`, `Side B`, etc.
- `AA1`, `BB1` map to `Side AA`, `Side BB`
- `1-1`, `1-2`, `2-1` map to deterministic disc groups such as `Disc 1`, `Disc 2`
- plain numeric positions such as `1`, `2`, `3` fall back to a single `Tracklist` group

### Output shape for normalized side data

Each normalized side should expose:

- `side_key`
- `side_label`
- `ordinal`
- `track_count`
- `tracks`

Example:

```json
{
  "side_key": "A",
  "side_label": "Side A",
  "ordinal": 0,
  "track_count": 4,
  "tracks": [{ "track_id": "trk_1", "position": "A1", "title": "Intro" }]
}
```

## API Design

Phase 1 should add the following endpoints.

### `GET /api/albums/{releaseId}/playable-structure?friend_id=1`

Purpose:

- return normalized album side structure for manual spin logging

Response:

```json
{
  "album": {
    "release_id": "12345",
    "friend_id": 1,
    "title": "Example LP",
    "artist": "Example Artist"
  },
  "sides": [
    {
      "side_key": "A",
      "side_label": "Side A",
      "ordinal": 0,
      "track_count": 3,
      "tracks": [
        {
          "track_id": "trk_1",
          "friend_id": 1,
          "position": "A1",
          "title": "Track One",
          "artist": "Example Artist"
        }
      ]
    }
  ]
}
```

Validation:

- `friend_id` required
- album must exist
- only tracks for the album and friend are returned

### `POST /api/spins`

Purpose:

- create one manual vinyl spin session

Request body:

```json
{
  "friend_id": 1,
  "release_id": "12345",
  "played_at": "2026-06-23T20:15:00Z",
  "note": "Played during warmup",
  "context_type": "home",
  "side_keys": ["A", "B"]
}
```

Alternative track-based request:

```json
{
  "friend_id": 1,
  "release_id": "12345",
  "played_at": "2026-06-23T20:15:00Z",
  "track_refs": [
    { "track_id": "trk_1", "friend_id": 1 },
    { "track_id": "trk_3", "friend_id": 1 }
  ]
}
```

Validation rules:

- `friend_id` required
- `release_id` required
- `played_at` required
- exactly one of `side_keys` or `track_refs` must be present
- `side_keys` must be unique and valid for the album
- `track_refs` must all belong to the album and friend
- request cannot be empty

Success response:

```json
{
  "session": {
    "id": 101,
    "friend_id": 1,
    "release_id": "12345",
    "medium": "vinyl",
    "selection_mode": "sides",
    "played_at": "2026-06-23T20:15:00.000Z",
    "note": "Played during warmup",
    "context_type": "home",
    "created_at": "2026-06-23T20:16:00.000Z"
  },
  "selections": [
    { "selection_type": "side", "side_key": "A", "ordinal": 0 },
    { "selection_type": "side", "side_key": "B", "ordinal": 1 }
  ],
  "expanded_tracks": [{ "track_id": "trk_1", "friend_id": 1, "position": "A1", "side_key": "A" }],
  "derived": {
    "is_full_album_spin": true,
    "selected_side_count": 2,
    "album_side_count": 2,
    "track_count": 8
  }
}
```

### `GET /api/spins`

Purpose:

- list manual vinyl spin sessions

Filters:

- `friend_id` required
- `release_id` optional
- `track_id` optional
- `from` optional
- `to` optional
- `limit` optional
- `offset` optional

Response should include:

- paginated session list
- selected sides/tracks
- derived metadata such as `is_full_album_spin`

### `DELETE /api/spins/{id}?friend_id=1`

Purpose:

- allow removing an incorrect manual log

Validation:

- `friend_id` required
- session must belong to that friend

Behavior:

- delete session
- cascade delete selections and track spin events

## OpenAPI Contract Requirements

Follow the existing frontend API pattern in `docs/frontend-api-pattern.md`.

For every new endpoint:

1. add Zod schemas in `src/api-contract/schemas.ts`
2. add explicit route contracts in `src/api-contract/routes.ts`
3. implement internal API methods in `src/services/internalApi/`
4. validate spec generation with `npm run openapi:check`

Phase 1 new schema families should include:

- album playable structure query/response
- spin create body
- spin session response
- spin list query/response
- spin delete query/response
- side descriptor schema
- spin selection schema
- expanded track spin schema

## Service and Repository Design

### Repository responsibilities

Add dedicated repositories rather than bloating album or track repositories too much.

Suggested files:

- `src/server/repositories/spinSessionRepository.ts`
- `src/server/repositories/trackSpinEventRepository.ts`

Repository responsibilities:

- insert session rows
- insert selection rows
- insert expanded track event rows
- query sessions with filters
- delete sessions

### Service responsibilities

Suggested file:

- `src/server/services/spinLoggingService.ts`

Service responsibilities:

- fetch album + tracks
- normalize sides
- validate side keys or track refs
- expand sides into ordered tracks
- derive `is_full_album_spin`
- write session, selections, and track events transactionally

### Transaction boundary

`POST /api/spins` must be transactional:

- create session
- create selections
- create track events

If any step fails, nothing should persist.

## Query / Analytics Strategy

### Phase 1

Basic analytics should come from `track_spin_events`.

Examples:

- most played track by friend
- most played track on a specific album
- recent physical spins

### Phase 2+

Possible future additions:

- materialized summaries
- album spin counts
- venue/context reports
- "last played" markers

Do not optimize early by storing counters yet.

## Future Extension Path

Future manual gig/set logging should be a sibling capability, not playback telemetry.

Likely direction:

- either extend `spin_sessions` with another `source_type`
- or add `set_sessions` that still expand into canonical track-level event rows

Not in scope now:

- playlist session tables
- playlist-driven logging APIs
- automatic imports from playback

## File Touch List

Expected implementation files for phase 1:

- `migrations/<timestamp>_add_spin_logging_tables.js`
- `src/lib/albumTrackPosition.ts`
- `src/lib/__tests__/albumTrackPosition.test.ts`
- `src/api-contract/schemas.ts`
- `src/api-contract/routes.ts`
- `src/app/api/spins/route.ts`
- `src/app/api/spins/[id]/route.ts`
- `src/app/api/albums/[releaseId]/playable-structure/route.ts`
- `src/server/repositories/spinSessionRepository.ts`
- `src/server/repositories/trackSpinEventRepository.ts`
- `src/server/services/spinLoggingService.ts`
- `src/services/internalApi/spins.ts`
- `src/services/internalApi/albums.ts`
- `src/lib/queryKeys.ts`
- relevant hooks and UI call sites
- optionally `packages/groovenet-client`
- optionally regenerated `packages/groovenet-python`

## Acceptance Criteria

- A user can log a manual vinyl spin for album sides.
- A user can log a manual vinyl spin for explicit tracks on an album.
- Multi-side albums such as 2xLPs work through normalized side keys.
- One session expands into track-level rows.
- `GET /api/spins` returns recent spin sessions.
- Deleting a session removes its derived rows.
- OpenAPI includes the new documented endpoints.
- No app playback code is involved in logging spins.

## Implementation Task Board

### Phase 0 - Lock Design

- [x] Clarify that this is manual physical vinyl logging, not app playback
- [x] Clarify that a spin is one session
- [x] Clarify that full album play is derived from one session covering all sides
- [x] Defer playlist/gig logging to a future extension
- [x] Write implementation spec and checklist

### Phase 1 - Backend Foundation

- [x] Create migration for `spin_sessions`
- [x] Create migration for `spin_session_selections`
- [x] Create migration for `track_spin_events`
- [x] Add indexes and constraints
- [x] Add repository layer for session persistence
- [x] Add service layer for validation and transactional writes

### Phase 2 - Side Normalization

- [x] Replace simple side parsing with stable side normalization
- [x] Add tests for `A/B/C/D` style positions
- [x] Add tests for `AA/BB` style positions
- [x] Add tests for `1-1/2-1` style multi-disc positions
- [x] Define deterministic fallback behavior for ambiguous positions

### Phase 3 - API Contract

- [x] Add Zod schemas for playable structure
- [x] Add Zod schemas for spin creation
- [x] Add Zod schemas for spin listing and deletion
- [x] Add explicit OpenAPI route contracts
- [x] Run `npm run openapi:check`
      Note: verified locally; OpenAPI generated successfully with 51 paths.

### Phase 4 - Route Handlers

- [x] Implement `GET /api/albums/{releaseId}/playable-structure`
- [x] Implement `POST /api/spins`
- [x] Implement `GET /api/spins`
- [x] Implement `DELETE /api/spins/{id}`
- [x] Add route-level validation and error handling

### Phase 5 - Client Integration

- [x] Add `src/services/internalApi/spins.ts`
- [x] Extend `src/services/internalApi/albums.ts` for playable structure
- [x] Add query keys for spins
- [x] Add hooks/mutations for create/list/delete flows

### Phase 6 - Verification

- [x] Add repository/service tests where practical
      Note: service-level unit tests were added for the spin logging service.
- [x] Add route tests where practical
- [x] Verify session creation expands to track spin rows
      Note: covered at the service unit-test layer and route response mapping layer.
- [x] Verify delete cascades cleanly
      Note: covered by architecture tests asserting cascade-delete schema wiring in the migration.
- [x] Verify no playback system coupling
      Note: covered by architecture tests asserting spin feature files do not reference playback modules.

### Phase 7 - Optional Follow-On

- [ ] Add shared TS client support in `packages/groovenet-client`
- [ ] Regenerate Python client from OpenAPI
- [ ] Decide whether spins belong in the mobile OpenAPI subset
- [x] Add UI for album spin logging
- [x] Add UI for per-album spin history
- [x] Add global spin history and most-played tracks UI

## Notes for the Implementing Model

- Follow `docs/frontend-api-pattern.md`.
- Keep API transport types Zod-derived.
- Prefer additive changes over reworking playback concepts.
- Do not silently conflate track playback with vinyl spins.
- Treat the checklist above as the implementation tracker and update boxes as work completes.
