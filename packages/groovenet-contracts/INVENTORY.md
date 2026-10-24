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
| 3 | settings (AI prompt, appearance, recommendations, gamdl) | 10 | Flat settings documents. |
| 4 | backups | 10 | Settings + status payloads; one binary download stays an exception. |
| 5 | background jobs | 5 | Job entity also shapes the SSE events. |
| 6 | genres | 7 | Recursive `GenreTreeNode` moves out of `routes.ts`. |
| 7 | genre reconciliation | 9 | Builds on genres; proposal action/method/status enums. |
| 8 | recommendations, embeddings | 9 | Similarity and backfill payloads; client types already exist. |
| 9 | providers & Discogs | 8 | External-provider passthroughs; least shared shape. |
| 10 | vinyl ingest & fingerprints, set derivation | 17 | Shared with `fingerprint-service`'s Python client; coordinate with its generated contracts. |
| 11 | system (`health`, `status`, `version`, `update-check`) | 4 | Auto-discovered only today; need contract entries first. |

The 25 `#551` rows are track/album operations outside this issue's scope. #551
is closed, so they need a follow-up issue as their owner.

## Operations

| Method | Path | Family | Status | Notes |
| --- | --- | --- | --- | --- |
| GET | `/api/albums` | albums | #551 | Inline OpenAPI; left by #594 (see its deferred list). |
| PATCH | `/api/albums` | albums | #551 | Inline OpenAPI; left by #594 (see its deferred list). |
| DELETE | `/api/albums/{releaseId}` | albums | #551 | Inline OpenAPI; left by #594 (see its deferred list). |
| GET | `/api/albums/{releaseId}` | albums | #551 | Inline OpenAPI; left by #594 (see its deferred list). |
| GET | `/api/albums/{releaseId}/artwork` | albums | contracts |  |
| PUT | `/api/albums/{releaseId}/artwork` | albums | contracts |  |
| POST | `/api/albums/{releaseId}/artwork/match` | albums | #551 | Inline OpenAPI; left by #594 (see its deferred list). |
| POST | `/api/albums/{releaseId}/artwork/preview` | albums | #551 | Inline OpenAPI; left by #594 (see its deferred list). |
| POST | `/api/albums/{releaseId}/artwork/upload` | albums | contracts |  |
| GET | `/api/albums/{releaseId}/discogs-raw` | albums | #551 | Inline OpenAPI; left by #594 (see its deferred list). |
| POST | `/api/albums/{releaseId}/download` | albums | #551 | Inline OpenAPI; left by #594 (see its deferred list). |
| GET | `/api/albums/{releaseId}/playable-structure` | albums | #551 | Inline OpenAPI; left by #594 (see its deferred list). |
| POST | `/api/albums/artwork/backfill` | albums | #551 | Inline OpenAPI; left by #594 (see its deferred list). |
| GET | `/api/albums/artwork/review` | albums | #551 | Inline OpenAPI; left by #594 (see its deferred list). |
| POST | `/api/albums/create` | albums | #551 | Inline OpenAPI; left by #594 (see its deferred list). |
| POST | `/api/albums/upsert` | albums | #551 | Inline OpenAPI; left by #594 (see its deferred list). |
| GET | `/api/audio` | audio streaming | exception | Byte-range audio stream; no JSON body. |
| POST | `/api/audio/ingest` | vinyl ingest & fingerprints | #552 |  |
| POST | `/api/audio/ingest/{ingestId}/claim` | vinyl ingest & fingerprints | #552 |  |
| POST | `/api/audio/ingest/{ingestId}/result` | vinyl ingest & fingerprints | #552 |  |
| GET | `/api/audio/ingest/recent` | vinyl ingest & fingerprints | #552 |  |
| GET | `/api/audio/ingest/retention` | vinyl ingest & fingerprints | #552 |  |
| GET | `/api/audio/ingest/stats` | vinyl ingest & fingerprints | #552 |  |
| POST | `/api/backup` | backups | #552 |  |
| POST | `/api/backup-custom` | backups | #552 |  |
| GET | `/api/backups` | backups | #552 |  |
| DELETE | `/api/backups/{filename}` | backups | #552 |  |
| GET | `/api/backups/{filename}` | backups | exception | Binary dump download; no JSON body. |
| GET | `/api/detections/recent` | vinyl ingest & fingerprints | #552 |  |
| GET | `/api/discogs` | providers & Discogs | #552 |  |
| POST | `/api/discogs/delete-releases` | providers & Discogs | #552 |  |
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
| GET | `/api/genres` | genres | #552 |  |
| POST | `/api/genres` | genres | #552 |  |
| GET | `/api/genres/{id}` | genres | #552 |  |
| PATCH | `/api/genres/{id}` | genres | #552 |  |
| POST | `/api/genres/{id}/aliases` | genres | #552 |  |
| POST | `/api/genres/{id}/merge` | genres | #552 |  |
| GET | `/api/genres/{id}/similar` | genres | #552 |  |
| GET | `/api/genres/proposals` | genre reconciliation | #552 |  |
| PATCH | `/api/genres/proposals/{id}` | genre reconciliation | #552 |  |
| GET | `/api/genres/proposals/{id}/tracks` | genre reconciliation | #552 |  |
| POST | `/api/genres/proposals/apply` | genre reconciliation | #552 |  |
| POST | `/api/genres/proposals/decisions` | genre reconciliation | #552 |  |
| POST | `/api/genres/proposals/restore` | genre reconciliation | #552 |  |
| GET | `/api/genres/reconciliation/coverage` | genre reconciliation | #552 |  |
| POST | `/api/genres/reconciliation/runs` | genre reconciliation | #552 |  |
| GET | `/api/genres/reconciliation/runs/{id}` | genre reconciliation | #552 |  |
| GET | `/api/health` | system | #552 | Auto-discovered only; no contract entry yet. |
| GET | `/api/health/backup` | backups | #552 |  |
| DELETE | `/api/jobs` | background jobs | #552 |  |
| GET | `/api/jobs` | background jobs | #552 |  |
| GET | `/api/jobs/{jobId}` | background jobs | #552 |  |
| GET | `/api/jobs/{jobId}/logs` | background jobs | #552 | Auto-discovered only; no contract entry yet. |
| POST | `/api/jobs/{jobId}/outcome` | background jobs | #552 |  |
| GET | `/api/jobs/events` | background jobs | exception | Server-sent event stream; event payloads follow the job entity, migrated with background jobs. |
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
| GET | `/api/record-copies` | record care | contracts |  |
| POST | `/api/record-copies` | record care | contracts |  |
| DELETE | `/api/record-copies/{id}` | record care | contracts |  |
| PATCH | `/api/record-copies/{id}` | record care | contracts |  |
| GET | `/api/record-copies/{id}/actions` | record care | contracts |  |
| GET | `/api/record-copies/care` | record care | contracts |  |
| GET | `/api/record-copies/care/summary` | record care | contracts |  |
| PATCH | `/api/record-copies/default` | record care | contracts |  |
| POST | `/api/restore` | backups | #552 |  |
| POST | `/api/set-derivations` | set derivation | #552 |  |
| GET | `/api/set-derivations/{id}` | set derivation | #552 |  |
| POST | `/api/set-derivations/{id}/claim` | set derivation | #552 |  |
| POST | `/api/set-derivations/{id}/result` | set derivation | #552 |  |
| GET | `/api/set-recordings/{sha256}` | set derivation | exception | Streams the stored recording; no JSON body. |
| HEAD | `/api/set-recordings/{sha256}` | set derivation | exception | Existence probe; headers only. |
| PUT | `/api/set-recordings/{sha256}` | set derivation | #552 |  |
| GET | `/api/settings/ai-prompt` | settings | #552 |  |
| PUT | `/api/settings/ai-prompt` | settings | #552 |  |
| GET | `/api/settings/appearance` | settings | #552 |  |
| PUT | `/api/settings/appearance` | settings | #552 |  |
| GET | `/api/settings/backup` | backups | #552 |  |
| PUT | `/api/settings/backup` | backups | #552 |  |
| POST | `/api/settings/backup/run` | backups | #552 |  |
| GET | `/api/settings/backup/status` | backups | #552 |  |
| GET | `/api/settings/default-library` | friends & library settings | contracts |  |
| PUT | `/api/settings/default-library` | friends & library settings | contracts |  |
| GET | `/api/settings/embedding-model` | embeddings | #552 |  |
| PATCH | `/api/settings/embedding-model` | embeddings | #552 |  |
| GET | `/api/settings/gamdl` | settings | #552 |  |
| PUT | `/api/settings/gamdl` | settings | #552 |  |
| PUT | `/api/settings/gamdl-cookies` | settings | #552 |  |
| POST | `/api/settings/gamdl/actions` | settings | #552 |  |
| GET | `/api/settings/recommendations` | settings | #552 |  |
| PUT | `/api/settings/recommendations` | settings | #552 |  |
| GET | `/api/spins` | spins | contracts |  |
| POST | `/api/spins` | spins | contracts |  |
| DELETE | `/api/spins/{id}` | spins | contracts |  |
| PATCH | `/api/spins/{id}` | spins | contracts |  |
| POST | `/api/spins/aggregate` | spins | contracts |  |
| GET | `/api/spins/top-tracks` | spins | contracts |  |
| GET | `/api/status` | system | #552 | Auto-discovered only; no contract entry yet. |
| PATCH | `/api/tracks` | tracks | contracts |  |
| DELETE | `/api/tracks/{id}` | tracks | #551 | Inline OpenAPI; left by #594 (see its deferred list). |
| GET | `/api/tracks/{id}` | tracks | contracts |  |
| GET | `/api/tracks/{id}/audio-metadata` | tracks | #551 | Inline OpenAPI; left by #594 (see its deferred list). |
| POST | `/api/tracks/{id}/audio-metadata` | tracks | #551 | Inline OpenAPI; left by #594 (see its deferred list). |
| GET | `/api/tracks/{id}/embedding-preview` | tracks | #551 | Inline OpenAPI; left by #594 (see its deferred list). |
| GET | `/api/tracks/{id}/essentia` | tracks | #551 | Inline OpenAPI; left by #594 (see its deferred list). |
| GET | `/api/tracks/{id}/playlists` | tracks | #551 | Inline OpenAPI; left by #594 (see its deferred list). |
| POST | `/api/tracks/{id}/restore` | tracks | #551 | Auto-discovered only; no contract entry yet. |
| POST | `/api/tracks/analyze-async` | tracks | #551 | Inline OpenAPI; left by #594 (see its deferred list). |
| POST | `/api/tracks/batch` | tracks | contracts |  |
| GET | `/api/tracks/deleted` | tracks | contracts |  |
| POST | `/api/tracks/fix-duration` | tracks | #551 | Auto-discovered only; no contract entry yet. |
| POST | `/api/tracks/playlist_counts` | tracks | #551 | Inline OpenAPI; left by #594 (see its deferred list). |
| GET | `/api/tracks/search` | tracks | contracts |  |
| GET | `/api/tracks/search/facets` | tracks | #551 | Inline OpenAPI; left by #594 (see its deferred list). |
| POST | `/api/tracks/upload` | tracks | #551 | Inline OpenAPI; left by #594 (see its deferred list). |
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
