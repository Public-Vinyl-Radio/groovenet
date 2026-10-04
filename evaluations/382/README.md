# #382 — embedding text redesign: roles and baseline

Phase 0 of #382: what each embedding is for today, how staleness and backfill
actually behave, and the baseline any candidate has to beat. No production
change. Offline candidates (phase 1) reuse the #379 harness in
`evaluations/379/` against the same snapshot, frozen queries and judgments.

Code references are to `my-collection-search/` at the commit this file lands in.

## Roles and serving routes

| Embedding | Text built by | Served by | Used for |
| --- | --- | --- | --- |
| `identity` | `buildIdentityText` in `src/lib/identity-embedding.ts` | `GET/POST /api/recommendations/candidates` (`mode=identity` or `combined`, single seed or seed centroid) via `src/lib/recommendation-candidate-retriever.ts` | "Similar tracks" by genre/era/country/style/tags: the client's `findSimilarIdentity`, the CLI and the MCP `find_similar_identity` tool, plus the identity half of combined recommendations |
| `audio_vibe` | `buildAudioVibeText` in `src/lib/audio-vibe-embedding.ts` | the same candidates route (`mode=audio` or `combined`); `/api/playlists/genetic` and `/api/tracks/batch` load raw vectors for ga-service | Audio similarity (`find_similar_vibe`) and playlist ordering |
| *(none)* | — | `/api/tracks/search` | Lexical search only: Postgres full-text + trigram. **No natural-language vector retrieval route exists.** |

Both embeddings are **text** embeddings (`text-embedding-3-small`, 1536 dims,
OpenAI): `audio_vibe` embeds a textual rendering of BPM, key, mood and
descriptors, not an audio model's output. Every read filters to the kind's
`serving_model` from `embedding_model_settings` (#386), and each
`(embedding_type, model)` pair has its own partial ivfflat index
(`lists = 100`, cosine).

The #379 query benchmark therefore measures a **proposed** retrieval use case
(query text → identity-style vectors). It is not a measurement of any route that
ships today. The playlist-mate proxy is the closer match to what
`/api/recommendations/candidates` actually serves.

Dead code: `embeddingsService.findSimilarIdentity` / `findSimilarVibe`
(`src/server/services/embeddingsService.ts`) have no route callers, and
`docs/IDENTITY_EMBEDDINGS.md` still documents `/api/embeddings/similar` and
`/api/embeddings/identity-preview`, which no longer exist (the preview is
`/api/tracks/{id}/embedding-preview`).

## Current identity text

```
Track: <title> — <artist>
Release: <album> (<era bucket>)
Composer: <composers>            # only when present
Country: <normalized country>
Labels: <up to 3 labels | none>
Genres: <up to 8 | unknown>
Styles: <up to 12 | unknown>
Tags: <up to 12 local tags, DJ-function tags removed | none>
```

Genres/styles prefer the album's Discogs values over the track's; list fields
are sorted, so the text and the source hash are canonical. Notes are excluded.

### What the #379 snapshot says about these fields

Aggregates only, from the private friend-6 snapshot (4,000 tracks, 409 albums;
snapshot SHA-256 `47744a52…d1ed`):

- Median identity text is 188 characters (p90 234). Title, artist, album and
  label lines are 46% of the characters, and they are identifiers, not
  descriptions.
- Genres: 13 distinct values, never missing. They are too coarse to separate
  scenes (`latin`, `folk world country`).
- Styles: 151 distinct; 231 tracks (5.8%) have none.
- Local tags: **2,185 distinct, 1,712 of them used once**; 165 tracks have none.
  The most common tags are the scene words queries need (`psychedelic cumbia`,
  `cumbia colombiana`, `chicha`, `salsa romántica`), but they are spelled
  inconsistently, so near-duplicate tags fragment.
- Country: 29 values, as lowercase codes (`us`), with no region words.
- Composer: populated on **0** tracks, so the line never appears.

**Normalization bug:** `normalizeToken` in `src/lib/identity-normalization.ts`
uses `/[^\w\s-]/g`, and `\w` is ASCII-only. It **deletes** accented letters
instead of folding them: `amazónica` → `amaznica`, `romántica` → `romntica`,
and `&` disappears (`rock & roll` → `rock roll`). 753 tracks (18.8%) have
non-ASCII local tags; labels, styles and country go through the same function.
Fixing it changes source hashes for those tracks, so it should ship as a
measured candidate (phase 1), not a silent fix.

## Staleness and backfill as implemented

- **Source hash** (`computeSourceHash`): SHA-256 of the normalized *input
  fields*. It does not include the template, so changing `buildIdentityText`
  leaves every hash unchanged and nothing is marked stale.
- **`template_version`**: written on every upsert (`IDENTITY_TEMPLATE_VERSION`,
  `AUDIO_VIBE_TEMPLATE_VERSION`, both `1`), but **no query reads it**.
- **Hash lookup ignores model**: `findEmbeddingSourceHash` filters on
  `(track, friend, type)` with `LIMIT 1` and no model. Once two models coexist
  (#386), an incremental update can read the other model's hash and skip
  embedding for the target model.
- **"Missing" ignores model and version**: `listTracksForBackfill` (used by the
  periodic `sweepTick` and the non-`force` backfill scopes) treats a track as
  covered if it has *any* row of that type. After a target-model switch or a
  template bump, only `scope: "all"` (which forces) re-embeds anything.
- **Same-model re-embeds overwrite serving rows**: the unique key is
  `(track_id, friend_id, embedding_type, model)`, so a template change on the
  same model rewrites live vectors row by row, and serving sees a mix of old and
  new text during a backfill. #386 made model switches safe; template switches
  are not.
- **Logging**: `generateIdentityEmbedding` logs the full identity text for every
  embed.

Any phase 3 rollout of changed text needs the first, fourth and fifth points
fixed first, or the text has to ship as a separate embedding type.

## Deployment mismatch

During #379, production's `/api/tracks/{id}/embedding-preview?friend_id=6`
still returned the removed `prompt` template, so production predates #393.
Offline results here compare against **current-code identity text (A)**. Live
search improvements can only be claimed once production runs current `main`.

## Baseline (A = current identity, from #379)

Same snapshot, `text-embedding-3-small`, exact cosine nearest-neighbour search.

| Metric | A |
| --- | --- |
| Judged precision@10, 24 frozen queries | **0.7667–0.7708** (184 relevant, 1 unresolved of 240) |
| — scene / style / instrumentation / crossover | 0.750 / 0.733 / 0.717 / 0.867 |
| Playlist proxy recall@10 (103 seeds) | 0.00942 |
| Playlist proxy MRR | 0.0881 |
| Embedding tokens, whole collection | ≈ 0.19 M, estimated from characters (≈ $0.004 at $0.02/M) |

Notes are out: #379 found raw (B) and cleaned (C) notes both lose to A overall.
Scene queries were the only group where B/C (0.767) edged A, which is the gap a
structured scene/region field from #380 would target.

## Phase 1 candidates (next)

All are built from fields the snapshot already has; #371 descriptors and #380
structured research don't exist yet.

- **A**: baseline, reusing the #379 vectors.
- **A′**: A with Unicode-aware normalization (fold accents, keep `&` as `and`).
  This isolates the bug fix.
- **D**: descriptive text only. Drop title, album and label; keep genres,
  styles, tags, era and country.
- **E**: D plus tested mappings: country code → country and region words, era →
  decade words, tag synonym merging.
- **F**: E plus the identifier lines, to check whether similar-tracks quality
  needs them.
- **Model**: the best text on `text-embedding-3-large`, truncated to 1536 dims
  and at its native 3072. Native 3072 is over pgvector's 2,000-dim index limit
  for `vector`, so serving it would need `halfvec`.

New top-10 hits outside the #379 pool get a fresh blinded review before their
precision@10 is reported. Unjudged hits are never counted as irrelevant.
