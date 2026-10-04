# Music Identity Embeddings

## Overview

This system implements "music identity" embeddings for tracks using OpenAI's `text-embedding-3-small` model and PostgreSQL's pgvector extension. Identity embeddings capture the musical essence of tracks based on metadata (genre, style, era, country, labels, tags) while **excluding** DJ-specific notes and function tags.

It is one of three embedding types, each with its own model settings and
template version:
1. **Identity**: musical identity from metadata. Serves similar tracks.
2. **Audio Vibe**: a text rendering of measured audio features (BPM, key, mood,
   danceability). Serves audio similarity and the playlist optimiser.
3. **Context** (#408): the same metadata as identity, rendered for
   natural-language retrieval. See [Context Embeddings](#context-embeddings-408).

---

## Architecture

### Database Schema

#### `track_embeddings` Table

Stores multiple types of embeddings per track with source hashing for efficient updates.

```sql
CREATE TABLE track_embeddings (
  id SERIAL PRIMARY KEY,
  track_id VARCHAR(255) NOT NULL,
  friend_id INTEGER NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  embedding_type embedding_type_enum NOT NULL, -- 'identity', 'audio_vibe', 'dj_function'
  model VARCHAR(100) NOT NULL DEFAULT 'text-embedding-3-small',
  dims INTEGER NOT NULL DEFAULT 1536,
  embedding VECTOR NOT NULL,  -- unconstrained (#386) — see "Multi-Model Embeddings" below
  source_hash VARCHAR(64) NOT NULL,
  identity_text TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (track_id, friend_id, embedding_type, model)
);

-- Indexes
CREATE INDEX idx_track_embeddings_track_id ON track_embeddings(track_id);
CREATE INDEX idx_track_embeddings_friend_id ON track_embeddings(friend_id);
CREATE INDEX idx_track_embeddings_type ON track_embeddings(embedding_type);

-- One partial expression index per (embedding_type, model) pair in use —
-- see "Multi-Model Embeddings" for why a single ivfflat index on the whole
-- (unconstrained) column doesn't work.
CREATE INDEX idx_track_embeddings_identity_openai_small
ON track_embeddings
USING ivfflat ((embedding::vector(1536)) vector_cosine_ops)
WITH (lists = 100)
WHERE embedding_type = 'identity' AND model = 'text-embedding-3-small';
```

### Code Structure

```
src/
├── lib/
│   ├── identity-normalization.ts   # Normalization utilities
│   ├── identity-embedding.ts       # Identity embedding service
│   ├── embeddings/
│   │   ├── config.ts                # Target/serving model + template version
│   │   └── templateVersions.ts      # Current template version per kind (#407)
│   └── __tests__/
│       ├── identity-normalization.test.ts
│       └── identity-embedding.test.ts
└── app/api/
    ├── embeddings/backfill/route.ts             # Backfill endpoint (#388)
    ├── embeddings/backfill/[runId]/route.ts     # Backfill run progress
    ├── embeddings/status/route.ts               # Missing counts, coverage per model/version
    ├── settings/embedding-model/route.ts        # Target/serving switch
    ├── tracks/[id]/embedding-preview/route.ts   # Preview endpoint (debugging)
    └── recommendations/candidates/route.ts      # Similarity queries
```

---

## Identity Embedding Format

### Template

Identity embeddings use a **deterministic, structured template**:

```
Track: {title} — {artist}
Release: {album} ({era_bucket})
Country: {country}
Labels: {label_1, label_2, ...}
Genres: {genres_list}
Styles: {styles_list}
Tags: {local_tags_list}
```

### Example

```
Track: Windowlicker — Aphex Twin
Release: Windowlicker (1990s)
Country: uk
Labels: warp records
Genres: electronic
Styles: idm, experimental, ambient
Tags: melodic, atmospheric
```

### Normalization Rules

1. **Era Bucketing**: Year → `1950s`, `1960s`, ..., `2020s`, `pre-1950s`, or `unknown-era`
2. **Genres/Styles**: Prefer Discogs metadata; fallback to Apple/iTunes genre
3. **Labels**: Max 3 labels (from album metadata)
4. **Country**: From album metadata; fallback to `unknown-country`
5. **Local Tags**: **Filter out DJ-function tags** (see below)
6. **All text**: Accents folded (`amazónica` → `amazonica`), lowercased, `&` → `and`,
   periods and apostrophes dropped (`J.S.` → `js`), every other run of
   punctuation — hyphens and non-ASCII dashes included — collapsed to one space
   (`Trip-Hop`, `trip hop` and `Trip‑hop` are one tag), then deduplicated.
   Free-text tags split on `,` `/` `;` and `|`. Before template version 2
   (#407) accented letters were deleted rather than folded.

### DJ-Function Tag Filter

These tags are **excluded** from identity embeddings (reserved for future DJ function embeddings):

- `warmup`, `warm-up`, `peak`, `peak-time`, `opener`, `closer`
- `tool`, `left-turn`, `transition`, `banger`
- `long intro`, `short intro`, `intro`, `outro`
- `breakdown`, `buildup`, `drop`, `filler`, `interlude`

Only genre/style/scene descriptor tags are included in identity embeddings.

### Source Hash and Template Version

A **SHA256 hash** of normalized identity data detects a change in the track's
*data*. A change to the *template* — the text built from that data, or how its
inputs are normalized — is tracked separately by a template version per kind,
in `src/lib/embeddings/templateVersions.ts`, stored on every row (#407).

A track is (re-)embedded when:
- it has no row at the kind's **target model** and the **current template version**;
- its source hash differs from that row's; or
- the force flag is set.

A row under another model or an older template never counts, so the periodic
sweep and a default backfill pick up a model switch or a template bump on
their own.

---

## CLI Commands

### 1. Backfill Identity Embeddings

**Command**: `groovenet embeddings backfill` (#388) — queues the work onto
the same background embedding queue #385 built, so it gets retry/backoff and
a pause on a bad key instead of failing outright. `groovenet embeddings status`
reports counts without queuing anything.

**Options**:
- `--type identity`: Only the identity embedding (default: identity and audio_vibe)
- `--friend-id N`: Limit to specific friend/user
- `--force`: Force re-embedding even if the source hash is unchanged
- `--release <id>` / `--track <ids>`: Narrow to one release or a comma-separated list of track ids
- `--dry-run`: Report counts only, queue nothing
- `--no-wait`: Queue and exit without waiting for it to finish
- `--json`: Machine-readable output

**Examples**:
```bash
# Backfill identity embeddings for all tracks without one
groovenet embeddings backfill --type identity

# Limit to specific friend
groovenet embeddings backfill --type identity --friend-id 1

# Force re-embed one release
groovenet embeddings backfill --type identity --release 38278164 --force

# Just see the counts first
groovenet embeddings backfill --type identity --dry-run
```

**Output**:
```
🚀 Starting identity embedding backfill
Options: { batch_size: 5, friend_id: 1 }

📊 Found 1523 tracks to process

✓ Batch 1/305: 5 success, 0 skipped, 0 failed | 12s elapsed, ~3600s remaining
✓ Batch 2/305: 5 success, 0 skipped, 0 failed | 24s elapsed, ~3576s remaining
...

============================================================
✅ Backfill complete!
============================================================
📊 Total tracks:     1523
✅ Success:          1520
⏭️  Skipped:          0
❌ Failed:           3
⏱️  Total time:       3645s
⚡ Rate:             0.42 tracks/sec
```

**Benefits of CLI over HTTP**:
- ✅ No timeout limits
- ✅ Real-time progress tracking
- ✅ Can run in tmux/screen and detach
- ✅ Easier to debug with full logs
- ✅ No web server required

---

## API Endpoints

### 1. Embedding Preview (Debugging)

**Endpoint**: `GET /api/tracks/{track_id}/embedding-preview`

**Query Params**:
- `friend_id` (required)
- `type` (optional): `identity` (default) or `audio_vibe`

Returns the exact text the pipeline embeds for that track, and the normalized
data it was built from. The text is never logged during generation.

```bash
curl "http://localhost:3000/api/tracks/12345/embedding-preview?friend_id=1&type=identity"
```

---

### 2. Find Similar Tracks

**Endpoint**: `GET /api/recommendations/candidates` (or `POST` with several seed tracks)

**Query Params**:
- `track_id` (required): Seed track
- `friend_id` (required): Seed track's friend_id
- `mode` (optional, default `combined`): `combined`, `identity` or `audio`
- `limit_identity` / `limit_audio` (optional, default 200)
- `ivfflat_probes` (optional, default 10): Accuracy/speed tradeoff

```bash
curl "http://localhost:3000/api/recommendations/candidates?track_id=12345&friend_id=1&mode=identity&limit_identity=20"
```

The typed client's `findSimilarIdentity` / `findSimilarVibe`, the CLI and the
MCP `find_similar_identity` / `find_similar_vibe` tools all call this route.
Every read is pinned to the kind's serving model *and* serving template
version.

**Distance Interpretation**:
- **0.0 - 0.2**: Very similar (near-duplicates, remixes, same artist/style)
- **0.2 - 0.4**: Similar (same genre/style, compatible vibe)
- **0.4 - 0.6**: Somewhat similar (related genres)
- **0.6+**: Distant (different genres/eras)

---

## Running Migrations

### Apply Migration

```bash
# From my-collection-search directory
npm run migrate up

# Or via Docker
docker compose run --rm migrate
```

### Rollback (if needed)

```bash
npm run migrate down
```

---

## Running Tests

```bash
# From my-collection-search directory
npx tsx src/lib/__tests__/identity-normalization.test.ts
npx tsx src/lib/__tests__/identity-embedding.test.ts
```

---

## Usage Workflow

### 1. Run Migration
```bash
npm run migrate up
```

### 2. Backfill Embeddings
```bash
# See the counts first
groovenet embeddings backfill --type identity --dry-run

# Then queue it
groovenet embeddings backfill --type identity

# Or limit to specific friend
groovenet embeddings backfill --type identity --friend-id 1
```

### 3. Query Similar Tracks
```bash
# Find similar tracks
curl "http://localhost:3000/api/recommendations/candidates?track_id=YOUR_TRACK_ID&friend_id=1&mode=identity&limit_identity=20"
```

---

## Performance Tuning

### OpenAI Rate Limits
- Free tier: ~3 requests/minute
- Paid tier: ~3,000 requests/minute
- Adjust `batch_size` accordingly (default: 5 concurrent)

### pgvector Index Tuning
- **`lists` parameter**: Currently 100 (good for <100K tracks)
  - Rule of thumb: `sqrt(total_rows)`
  - For 10K tracks: `lists = 100`
  - For 100K tracks: `lists = 316`
  - For 1M tracks: `lists = 1000`

- **`ivfflat.probes`**: Query-time accuracy knob
  - Default: 10 (fast, ~90% recall)
  - Higher = more accurate but slower
  - Max: `lists` value
  - Example: `SET ivfflat.probes = 20;`

### Re-indexing After Bulk Inserts
```sql
-- Drop and recreate one kind/model's index with a new lists value
DROP INDEX idx_track_embeddings_identity_openai_small;
CREATE INDEX idx_track_embeddings_identity_openai_small
ON track_embeddings
USING ivfflat ((embedding::vector(1536)) vector_cosine_ops)
WITH (lists = 316) -- Adjust based on row count
WHERE embedding_type = 'identity' AND model = 'text-embedding-3-small';
```

---

## Multi-Model Embeddings (#386)

Identity and audio_vibe embeddings aren't pinned to one model or vector size.
Each row in `track_embeddings` records the `model`/`dims` it was generated
with, and every similarity query filters to one model — vectors from
different models are never compared, and a track can hold rows for two
models at once while a switch is in progress.

### Why the column is an unconstrained `vector`

pgvector can't build an `ivfflat`/`hnsw` index directly on an unconstrained
`vector` column (`column does not have dimensions`), but a **partial
expression index** — cast to a fixed dimension, scoped to one
`(embedding_type, model)` pair — works, because every row the partial
predicate admits shares that dimension:

```sql
CREATE INDEX ... USING ivfflat ((embedding::vector(1536)) vector_cosine_ops)
WITH (lists = 100)
WHERE embedding_type = 'identity' AND model = 'text-embedding-3-small';
```

Adding a model that will be queried by ANN search means adding its own
index this way, in a migration — there's no dynamic index creation.

### Supported models

Any OpenAI embedding model works through `createOpenAiEmbeddingProvider`
(`src/lib/embeddings/openaiProvider.ts`); `dims` is optional and uses OpenAI's
`dimensions` param to shorten a v3 model's vector. In active use today:

| Model | dims | Notes |
| --- | --- | --- |
| `text-embedding-3-small` | 1536 | Default for both identity and audio_vibe |
| `text-embedding-3-small` | 768 | Same model, OpenAI's `dimensions` param |

### Switching a kind's model

Two settings per kind (`identity`/`audio_vibe`) in `embedding_model_settings`,
read/written through `src/lib/embeddings/config.ts` and
`GET`/`PATCH /api/settings/embedding-model`:

- **`target_model`/`target_dims`** — what new embedding jobs embed with.
- **`serving_model`/`serving_dims`** — what similarity queries filter to.

They default to the same value, so nothing changes until you touch them.
To switch:

1. `PATCH /api/settings/embedding-model` with
   `{ "embedding_type": "identity", "field": "target", "model": "...", "dims": N }`.
   New and re-embedded tracks now get rows under the new model; reads are
   untouched because `serving_model` hasn't moved.
2. Run a backfill for that kind (`groovenet embeddings backfill --type identity`,
   or `POST /api/embeddings/backfill`) to build the new model's full set. No
   `force` needed: tracks without a row at the target model count as missing,
   and the periodic sweep picks them up anyway (#407).
   `GET /api/embeddings/status` reports `by_model` — row counts per model and
   template version — so you can watch coverage without guessing.
3. Once coverage looks right, `PATCH .../embedding-model` again with
   `field: "serving"` and the new model/dims. Reads switch over immediately;
   nothing to migrate, since serving is just a filter value.
4. The old model's rows are now unused but harmless. Clean them up with
   `DELETE FROM track_embeddings WHERE embedding_type = $1 AND model = $2`
   once you're confident you won't want to roll back.

If the new `(embedding_type, model)` pair will be queried by ANN search at
any real scale, add its partial index in the same migration that introduces
it (see above) — without one, queries still work, just without the index.

### Changing the embedding text (template versions, #407)

A template change is the same cutover with the target half done by deploying
code. `track_embeddings`' unique key includes `template_version`, so rows from
the old and new templates coexist and the served set is never overwritten
mid-backfill; reads filter to `serving_template_version` in
`embedding_model_settings`.

1. Change the builder (or its normalization) and bump that kind's entry in
   `src/lib/embeddings/templateVersions.ts`. Deploy.
2. Every track now lacks a row at the new version, so the periodic sweep (or
   a default backfill) re-embeds the whole kind with the new text. Watch
   `GET /api/embeddings/status` until `by_model` shows the new
   `template_version` covering the collection and `missing` reaches zero.
   Until the cutover, reads keep using the old version; a track edited
   meanwhile only gets a new-version row, so its served vector stays at the
   old text until step 3.
3. `PATCH /api/settings/embedding-model` with
   `{ "embedding_type": "identity", "field": "serving", "model": "<serving model>", "dims": N, "template_version": 2 }`.
   Omitting `template_version` on a serving PATCH keeps the current one.
4. Once you won't roll back, delete the old version's rows:
   `DELETE FROM track_embeddings WHERE embedding_type = $1 AND template_version < $2`.

With both versions in the same partial ivfflat index, a query's candidates
are filtered to one version after the index scan. At this collection's size
the default 10 probes still return far more than any `limit`; if results ever
come back short mid-transition, raise `ivfflat_probes` or finish the cutover.

---

## Context Embeddings (#408)

A `context` row is built from exactly the normalized data identity uses
(`buildIdentityData`), but rendered descriptors-first:

```
chicha, cumbia, cumbia amazonica, psychedelic. latin music from the 1970s.
Track: Song — Artist
Release: Album
Labels: discos fuentes, infopesa
```

On #382's frozen 24-query evaluation this text scored precision@10
0.89–0.90 against 0.77 for the identity text, better on 16 queries and worse on
2. It was the worst text on the playlist-mate proxy, though, so it sits beside
`identity` rather than replacing it. Release country is left out, because it is
the pressing's country rather than the music's origin.

- **Generation**: `src/lib/context-embedding.ts`. Every place that queues an
  identity job (track PATCH, upload, Discogs sync, the periodic sweep and
  backfills) queues a `context` job too. Staleness uses the identity source hash
  plus the `context` template version.
- **Settings**: `embedding_model_settings` row `context`, seeded on
  `text-embedding-3-small` / 1536 with its own partial ivfflat index.
  Model switches and template cutovers work exactly as for identity.
- **Retrieval**: `embeddingsRepository.findContextMatches` takes a query vector
  and returns the nearest tracks at the serving model and template version:
  - at most `perReleaseCap` per release, because context text is mostly
    album-level and one matching album would otherwise fill the page;
  - optional SQL filters for friend, `yearToEra` bucket, genre or style
    (album first, case-insensitive) and BPM range;
  - the vector scan over-fetches `candidatePool` rows (default
    `max(limit × 10, 200)`) so the cap and filters still leave a full page.

  No public route uses it yet; the search endpoint is #409.
- **Preview**: `GET /api/tracks/{id}/embedding-preview?friend_id=1&type=context`.
- **Backfill**: `groovenet embeddings backfill --type context`.
  `GET /api/embeddings/status` reports `missing.context` and `by_model.context`.

---

## Integration with Existing System

### Legacy `tracks.embedding` (removed)

The free-text "prompt" embedding on `tracks.embedding`, its per-friend
`embedding_prompt_settings` template and the `prompt` job kind were removed in
#393. Its last consumer, ga-service's genetic playlist optimizer, now takes the
`audio_vibe` vector from `track_embeddings` at the serving model.

---------|----------------------------|---------------------------|
| Storage | Single column on `tracks` | Separate table |
| Types | One embedding per track | Multiple types (identity, audio, DJ) |
| Source tracking | No hash | SHA256 source hash |
| Update logic | Always re-embed | Skip if hash unchanged |
| DJ notes | Included | Excluded (identity only) |
| Template | User-customizable | Deterministic, type-specific |

### Migration Path

The new system runs **in parallel** with the legacy system:
- Legacy `tracks.embedding` remains unchanged
- New `track_embeddings` table stores typed embeddings
- No breaking changes to existing features

**Future**: Deprecate `tracks.embedding` once all embedding types are
implemented. The one remaining consumer is ga-service's genetic playlist
optimizer, tracked in #393.

---

## Roadmap

### Implemented
- ✅ `track_embeddings` table with pgvector
- ✅ Identity embedding generation with normalization
- ✅ Source hashing for efficient updates
- ✅ Backfill API with batching
- ✅ Similarity query API with filters
- ✅ Tests for normalization and hashing

### Future Enhancements
- [ ] **Audio Vibe Embeddings**: BPM, key, danceability, mood scores
- [ ] **DJ Function Embeddings**: DJ notes, use-case tags, set position
- [ ] **Incremental Updates**: Auto-embed on track create/update
- [ ] **Hybrid Search**: Combine identity + audio vibe similarity
- [x] **UI Integration**: Similar tracks accessible via track menu (⋮ button)
- [ ] **Filter UI**: Add era/country/tags filters to Similar Tracks modal
- [ ] **Background Jobs**: Queue embeddings via existing worker system
- [ ] **Batch Similarity**: Find similar tracks for entire playlists

---

## Troubleshooting

### Embedding Not Found Error
```json
{ "error": "Track has no identity embedding. Run backfill first." }
```
**Solution**: Run backfill for that track/friend_id.

### OpenAI Rate Limit Errors
**Solution**: Reduce `batch_size` or add retry logic with exponential backoff.

### Slow Similarity Queries
**Solution**: Increase `ivfflat.probes` or rebuild index with higher `lists` value.

### Source Hash Not Updating
If the builder's text changed but the track data didn't, the hash can't see
it: bump the kind's template version (see "Changing the embedding text").
To re-embed one track regardless, use `force=true`.

---

## Credits

- **pgvector**: https://github.com/pgvector/pgvector
- **OpenAI Embeddings**: https://platform.openai.com/docs/guides/embeddings
- **Model**: `text-embedding-3-small` by default — see "Multi-Model Embeddings" above

## 🎨 UI Integration

The **Similar Tracks** feature is integrated into your existing UI via the track actions menu.

### How to Use

1. **Find a track** in search results, playlists, or track detail pages
2. Click the **⋮** (three dots) menu button
3. Select **"Similar Tracks"**
4. View identity-based similar tracks with distance scores

### Features

- ✅ **Real-time similarity search** via pgvector cosine distance
- ✅ **Distance badges**: Very Similar / Similar / Somewhat Similar / Distant
- ✅ **Color-coded** by similarity (green = very similar, gray = distant)
- ✅ **Inline actions**: Add to playlist, edit track, etc.
- ✅ **Smart minimization**: First 5 results expanded, rest minimized
- ✅ **Filters displayed**: Shows active era/country/tags filters

### Components Added

| File | Purpose |
|------|---------|
| `hooks/useSimilarTracks.ts` | React Query hook for API calls |
| `components/SimilarTracks.tsx` | Modal content component |
| `components/TrackActionsMenu.tsx` | Added menu item & modal |

### Screenshots

**Menu Item:**
- Look for "Similar Tracks" in the track actions menu (⋮)
- Icon: 🎯 (target)
- Positioned below "AI Recommendations"

**Modal:**
- Title: "Similar Tracks: {track name}"
- Distance badges show similarity level
- Tracks sorted by distance (closest first)
- Help text explains how identity embeddings work

### Distance Interpretation

| Distance | Badge | Meaning |
|----------|-------|---------|
| 0.0 - 0.2 | <span style="color:green">**Very Similar**</span> | Near-duplicates, remixes, same artist/style |
| 0.2 - 0.4 | <span style="color:blue">**Similar**</span> | Same genre/style, compatible vibe |
| 0.4 - 0.6 | <span style="color:orange">**Somewhat Similar**</span> | Related genres |
| 0.6+ | <span style="color:gray">**Distant**</span> | Different genres/eras |

---
