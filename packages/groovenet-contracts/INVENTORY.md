# API contract inventory

Every operation the OpenAPI document publishes, and where its contract lives.
`my-collection-search/src/api-contract/__tests__/contractInventory.test.ts`
checks this table against the generated document, so a new route fails CI
until it has a row here, and a removed route fails until its row is removed.

Statuses:

- **contracts** — request/response shapes are defined in `@groovenet/contracts`
  and the OpenAPI operation references the shared components.
- **#550** / **#551** — the playlist and track/album slices of #259. Both have
  merged (#581, #594); `#551` rows are the track/album operations #594 left on
  hand-written OpenAPI, listed in its "Deferred, deliberately" section.
- **#552** — the remaining families, migrated by #552 a family per PR.
- **exception** — the operation has no JSON contract to share. The note says
  why; the owner is #552 unless the note names another issue.

## Remaining families (#552)

Migrated a family per PR, smallest and least entangled first. Operation
counts are as of this inventory; the table below is authoritative.

| Order | Family | Ops | Why this order |
| --- | --- | --- | --- |
| done | friends & library settings | 4 | Flat shapes, no enums; established the inventory. |
| done | record care | 10 | Self-contained, enum-heavy (sleeve, action, cleaning method, care status). |
| done | spins | 6 | Client and CLI already declared `SpinSession` and friends by hand. |
| done | settings (AI prompt, appearance, recommendations, gamdl) | 10 | Flat settings documents. |
| done | backups | 10 | Settings + status payloads; one binary download stays an exception. |
| done | background jobs | 5 | Job entity also shapes the SSE events. |
| done | genres | 7 | Recursive `GenreTreeNode` moves out of `routes.ts`. |
| done | genre reconciliation | 9 | Builds on genres; proposal action/method/status enums. |
| 8 | recommendations, embeddings | 9 | Similarity and backfill payloads; client types already exist. |
| 9 | providers & Discogs | 8 | External-provider passthroughs; least shared shape. |
| 10 | vinyl ingest & fingerprints, set derivation | 17 | Shared with `fingerprint-service`'s Python client; coordinate with its generated contracts. |
| 11 | system (`health`, `status`, `version`, `update-check`) | 4 | Auto-discovered only today; need contract entries first. |

The remaining `#551` rows are track operations outside this issue's scope. #551
is closed; #606 owns them (its album half is migrated).

## Operations

| Method | Path | Family | Status | Notes |
| --- | --- | --- | --- | --- |
| GET | `/api/albums` | albums | contracts |  |
| PATCH | `/api/albums` | albums | contracts |  |
| DELETE | `/api/albums/{releaseId}` | albums | contracts |  |
| GET | `/api/albums/{releaseId}` | albums | contracts |  |
| GET | `/api/albums/{releaseId}/artwork` | albums | contracts |  |
| PUT | `/api/albums/{releaseId}/artwork` | albums | contracts |  |
| POST | `/api/albums/{releaseId}/artwork/match` | albums | contracts |  |
| POST | `/api/albums/{releaseId}/artwork/preview` | albums | contracts |  |
| POST | `/api/albums/{releaseId}/artwork/upload` | albums | contracts |  |
| GET | `/api/albums/{releaseId}/discogs-raw` | albums | contracts |  |
| POST | `/api/albums/{releaseId}/download` | albums | contracts |  |
| GET | `/api/albums/{releaseId}/playable-structure` | albums | contracts |  |
| POST | `/api/albums/artwork/backfill` | albums | contracts |  |
| GET | `/api/albums/artwork/review` | albums | contracts |  |
| POST | `/api/albums/create` | albums | contracts |  |
| POST | `/api/albums/upsert` | albums | contracts |  |
| GET | `/api/audio` | audio streaming | exception | Byte-range audio stream; no JSON body. |
| POST | `/api/audio/ingest` | vinyl ingest & fingerprints | #552 |  |
| POST | `/api/audio/ingest/{ingestId}/claim` | vinyl ingest & fingerprints | #552 |  |
| POST | `/api/audio/ingest/{ingestId}/result` | vinyl ingest & fingerprints | #552 |  |
| GET | `/api/audio/ingest/recent` | vinyl ingest & fingerprints | #552 |  |
| GET | `/api/audio/ingest/retention` | vinyl ingest & fingerprints | #552 |  |
| GET | `/api/audio/ingest/stats` | vinyl ingest & fingerprints | #552 |  |
| POST | `/api/backup` | backups | contracts |  |
| POST | `/api/backup-custom` | backups | contracts |  |
| GET | `/api/backups` | backups | contracts |  |
| DELETE | `/api/backups/{filename}` | backups | contracts |  |
| GET | `/api/backups/{filename}` | backups | exception | Binary dump download; no JSON body. |
| GET | `/api/detections/recent` | vinyl ingest & fingerprints | #552 |  |
| GET | `/api/discogs` | providers & Discogs | #552 |  |
| POST | `/api/discogs/delete-releases` | providers & Discogs | #552 |  |
| GET | `/api/discogs/users/{username}` | providers & Discogs | #552 |  |
| GET | `/api/discogs/verify-manifests` | providers & Discogs | #552 |  |
| POST | `/api/discogs/verify-manifests` | providers & Discogs | #552 |  |
| GET | `/api/docs` | API docs | exception | Swagger UI HTML page, not a resource. |
| POST | `/api/embeddings/backfill` | embeddings | #552 |  |
| GET | `/api/embeddings/backfill/{runId}` | embeddings | #552 |  |
| GET | `/api/embeddings/queue` | embeddings | #552 |  |
| POST | `/api/embeddings/queue/retry` | embeddings | #552 |  |
| GET | `/api/embeddings/status` | embeddings | #552 |  |
| GET | `/api/fingerprints` | vinyl ingest & fingerprints | #552 |  |
| PATCH | `/api/fingerprints` | vinyl ingest & fingerprints | #552 |  |
| POST | `/api/fingerprints` | vinyl ingest & fingerprints | #552 |  |
| POST | `/api/fingerprints/index` | vinyl ingest & fingerprints | #552 |  |
| GET | `/api/fingerprints/index/{runId}` | vinyl ingest & fingerprints | #552 |  |
| DELETE | `/api/friends` | friends & library settings | exception | Plain-text progress stream; the `username` query is validated in the app. |
| GET | `/api/friends` | friends & library settings | contracts |  |
| POST | `/api/friends` | friends & library settings | contracts |  |
| GET | `/api/friends/libraries` | friends & library settings | #552 | Settings-only view with stats; app-local schema. |
| GET | `/api/genres` | genres | contracts |  |
| POST | `/api/genres` | genres | contracts |  |
| GET | `/api/genres/{id}` | genres | contracts |  |
| PATCH | `/api/genres/{id}` | genres | contracts |  |
| POST | `/api/genres/{id}/aliases` | genres | contracts |  |
| POST | `/api/genres/{id}/merge` | genres | contracts |  |
| GET | `/api/genres/{id}/similar` | genres | contracts |  |
| GET | `/api/genres/proposals` | genre reconciliation | contracts | #1019 |
| PATCH | `/api/genres/proposals/{id}` | genre reconciliation | contracts | #1019 |
| GET | `/api/genres/proposals/{id}/tracks` | genre reconciliation | contracts | #1019 |
| POST | `/api/genres/proposals/apply` | genre reconciliation | contracts | #1019 |
| POST | `/api/genres/proposals/decisions` | genre reconciliation | contracts | #1019 |
| POST | `/api/genres/proposals/restore` | genre reconciliation | contracts | #1019 |
| GET | `/api/genres/reconciliation/coverage` | genre reconciliation | contracts | #1019 |
| POST | `/api/genres/reconciliation/runs` | genre reconciliation | contracts | #1019 |
| GET | `/api/genres/reconciliation/runs/{id}` | genre reconciliation | contracts | #1019 |
| GET | `/api/health` | system | #552 | Auto-discovered only; no contract entry yet. |
| GET | `/api/health/backup` | backups | contracts |  |
| DELETE | `/api/jobs` | background jobs | contracts |  |
| GET | `/api/jobs` | background jobs | contracts |  |
| GET | `/api/jobs/{jobId}` | background jobs | contracts |  |
| GET | `/api/jobs/{jobId}/logs` | background jobs | contracts | Contract entry added with the migration. |
| POST | `/api/jobs/{jobId}/outcome` | background jobs | contracts | Bodyless; response shared with `download-worker`'s Python client. |
| GET | `/api/jobs/events` | background jobs | exception | Server-sent event stream; event payloads are the shared `JobEvent` schema. |
| GET | `/api/openapi.json` | API docs | exception | Serves the generated spec itself. |
| GET | `/api/openapi.mobile.json` | API docs | exception | Serves the generated spec itself. |
| DELETE | `/api/playlists` | playlists | contracts |  |
| GET | `/api/playlists` | playlists | contracts |  |
| PATCH | `/api/playlists` | playlists | contracts |  |
| POST | `/api/playlists` | playlists | contracts |  |
| DELETE | `/api/playlists/{id}/set` | live sets | contracts |  |
| GET | `/api/playlists/{id}/set` | live sets | contracts |  |
| POST | `/api/playlists/{id}/set` | live sets | contracts |  |
| PUT | `/api/playlists/{id}/set` | live sets | contracts |  |
| POST | `/api/playlists/{id}/spins` | playlists | contracts |  |
| GET | `/api/playlists/{id}/tracks` | playlists | contracts |  |
| POST | `/api/playlists/genetic` | playlists | contracts |  |
| POST | `/api/providers/apple-music/search` | providers & Discogs | #552 |  |
| GET | `/api/providers/discogs/release-lookup` | providers & Discogs | #552 |  |
| POST | `/api/providers/openai/track-metadata` | providers & Discogs | #552 |  |
| POST | `/api/providers/youtube/music-search` | providers & Discogs | #552 |  |
| GET | `/api/recommendations/candidates` | recommendations | #552 |  |
| POST | `/api/recommendations/candidates` | recommendations | #552 |  |
| POST | `/api/record-actions` | record care | contracts |  |
| DELETE | `/api/record-actions/{id}` | record care | contracts |  |
| GET | `/api/record-care/sessions` | record care | contracts |  |
| POST | `/api/record-care/sessions` | record care | contracts |  |
| POST | `/api/record-care/sessions/{id}/void` | record care | contracts |  |
| GET | `/api/record-care/stacks` | record care | contracts |  |
| POST | `/api/record-care/stacks` | record care | contracts |  |
| DELETE | `/api/record-care/stacks/{id}` | record care | contracts |  |
| GET | `/api/record-care/stacks/{id}` | record care | contracts |  |
| GET | `/api/record-copies` | record care | contracts |  |
| POST | `/api/record-copies` | record care | contracts |  |
| DELETE | `/api/record-copies/{id}` | record care | contracts |  |
| PATCH | `/api/record-copies/{id}` | record care | contracts |  |
| GET | `/api/record-copies/{id}/actions` | record care | contracts |  |
| GET | `/api/record-copies/care` | record care | contracts |  |
| GET | `/api/record-copies/care/summary` | record care | contracts |  |
| GET | `/api/record-care/queue` | Record Care | contracts | Prioritized never-cleaned queue (`recordCareQueue.ts`) |
| GET | `/api/record-care/progress` | Record Care | contracts | Ever-cleaned progress and pace (`recordCareQueue.ts`) |
| PATCH | `/api/record-copies/default` | record care | contracts |  |
| POST | `/api/restore` | backups | contracts |  |
| POST | `/api/set-derivations` | set derivation | #552 |  |
| GET | `/api/set-derivations/{id}` | set derivation | #552 |  |
| POST | `/api/set-derivations/{id}/claim` | set derivation | #552 |  |
| POST | `/api/set-derivations/{id}/result` | set derivation | #552 |  |
| GET | `/api/set-recordings/{sha256}` | set derivation | exception | Streams the stored recording; no JSON body. |
| HEAD | `/api/set-recordings/{sha256}` | set derivation | exception | Existence probe; headers only. |
| PUT | `/api/set-recordings/{sha256}` | set derivation | #552 |  |
| GET | `/api/settings/ai-prompt` | settings | contracts |  |
| PUT | `/api/settings/ai-prompt` | settings | contracts |  |
| GET | `/api/settings/appearance` | settings | contracts |  |
| PUT | `/api/settings/appearance` | settings | contracts |  |
| GET | `/api/settings/backup` | backups | contracts |  |
| PUT | `/api/settings/backup` | backups | contracts |  |
| POST | `/api/settings/backup/run` | backups | contracts |  |
| GET | `/api/settings/backup/status` | backups | contracts |  |
| GET | `/api/settings/default-library` | friends & library settings | contracts |  |
| PUT | `/api/settings/default-library` | friends & library settings | contracts |  |
| GET | `/api/settings/embedding-model` | embeddings | #552 |  |
| PATCH | `/api/settings/embedding-model` | embeddings | #552 |  |
| GET | `/api/settings/gamdl` | settings | contracts |  |
| PUT | `/api/settings/gamdl` | settings | contracts |  |
| PUT | `/api/settings/gamdl-cookies` | settings | contracts |  |
| POST | `/api/settings/gamdl/actions` | settings | contracts |  |
| GET | `/api/settings/recommendations` | settings | contracts |  |
| PUT | `/api/settings/recommendations` | settings | contracts |  |
| GET | `/api/spins` | spins | contracts |  |
| POST | `/api/spins` | spins | contracts |  |
| DELETE | `/api/spins/{id}` | spins | contracts |  |
| PATCH | `/api/spins/{id}` | spins | contracts |  |
| POST | `/api/spins/aggregate` | spins | contracts |  |
| GET | `/api/spins/top-tracks` | spins | contracts |  |
| GET | `/api/home` | home | contracts | `home.ts`; playlists scoped by track membership. |
| GET | `/api/spins/recap` | Spins | contracts | Monthly recap (#862) |
| GET | `/api/spins/track-stats` | Spins | contracts | One track's plays, both media (#864) |
| GET | `/api/status` | system | #552 | Auto-discovered only; no contract entry yet. |
| PATCH | `/api/tracks` | tracks | contracts |  |
| DELETE | `/api/tracks/{id}` | tracks | contracts |  |
| GET | `/api/tracks/{id}` | tracks | contracts |  |
| GET | `/api/tracks/{id}/audio-metadata` | tracks | contracts |  |
| POST | `/api/tracks/{id}/audio-metadata` | tracks | contracts |  |
| GET | `/api/tracks/{id}/embedding-preview` | tracks | contracts | `type` enum shared; preview `data` is documented, not parsed at runtime (#606). |
| GET | `/api/tracks/{id}/essentia` | tracks | contracts |  |
| GET | `/api/tracks/{id}/playlists` | tracks | contracts |  |
| POST | `/api/tracks/{id}/restore` | tracks | contracts | `TrackRestoreResponse`; entity parsed after `toWireRow` (#606). |
| POST | `/api/tracks/analyze-async` | tracks | contracts | Body is `friend_id` + at least one URL; the URL rule is checked in the route (#606). |
| POST | `/api/tracks/batch` | tracks | contracts |  |
| GET | `/api/tracks/deleted` | tracks | contracts |  |
| POST | `/api/tracks/fix-duration` | tracks | contracts | Body and job id response shared (#606). |
| POST | `/api/tracks/playlist_counts` | tracks | contracts |  |
| GET | `/api/tracks/search` | tracks | contracts |  |
| GET | `/api/tracks/search/facets` | tracks | contracts |  |
| POST | `/api/tracks/upload` | tracks | exception | `multipart/form-data` request (a binary `file` part), which has no Zod or JSON Schema form; the route reads `formData()`. The inline OpenAPI documents the form fields and response (#606). |
| GET | `/api/update-check` | system | #552 | Auto-discovered only; no contract entry yet. |
| GET | `/api/version` | system | #552 | Auto-discovered only; no contract entry yet. |

## Server players (#693)

| Method | Path | Family | Status | Notes |
| --- | --- | --- | --- | --- |
| GET | `/api/players` | players | contracts | Independent named player snapshots. |
| POST | `/api/players` | players | contracts | Configured engine IDs only. |
| GET | `/api/players/engines` | players | contracts | Connection credentials never exposed. |
| GET | `/api/players/{playerId}` | players | contracts | Revision and checkpoint semantics. |
| POST | `/api/players/{playerId}/commands` | players | contracts | Explicit transfer and conflicting-edit rejection. |
| GET | `/api/players/{playerId}/devices` | players | contracts | Observations separate from assignments. |
| GET | `/api/players/{playerId}/events` | players | exception | SSE full snapshots use ServerPlayerEvent; not a JSON response. |
| GET | `/api/players/events` | players | exception | SSE initial players list and changed-player snapshots, validated by shared player event schemas |
| GET | `/api/players/browser/session` | players | exception | App-only household browser session status; no worker credential in responses. |
| POST | `/api/players/browser/session` | players | exception | App-only web passphrase unlock; scoped Secure HttpOnly cookie. |
| DELETE | `/api/players/browser/session` | players | exception | App-only session logout; leaves server playback running. |
