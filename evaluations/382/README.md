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

## Phase 1: offline candidates

Builders are in `variants.mjs` and are tested in `variants.test.mjs`. A reuses
#379's builder, so it stays identical to the app's current text.

| Variant | Text |
| --- | --- |
| **A** | Current identity text, including the accent bug |
| **A2** | A with `foldToken`: accents folded rather than deleted, `&` → `and`, every dash or hyphen → space, tags split on `, / ; \|` |
| **D** | A2 without the title, artist, album and label lines: era, release country, genres, styles, tags |
| **E** | D as one sentence (`descriptors. genres music from the 1970s.`), with no release country, because 229 of 409 albums are `US` pressings of non-US music |
| **F** | E plus the title/artist, album and label lines |

Folding cuts distinct local tags from 2,186 to 1,683. D and E have only
2,722 and 2,613 distinct texts for 4,000 tracks, because tracks on one album
share every descriptive field. Their vectors tie, and ties rank by snapshot
order, so the same-release-excluded playlist slice matters for them.

### Reproduce

All outputs are private, git-ignored and refuse to overwrite. `S` is the #379
data directory.

```bash
node --test evaluations/382/*.test.mjs
node evaluations/382/prepare.mjs --snapshot $S/379-friend-6.json --output eval-data/382-texts.json
# Dry run first (prints the estimate), then add --execute
op run --env-file=.env.tpl -- node evaluations/382/embed.mjs --texts eval-data/382-texts.json \
  --output-dir eval-data/382-small --variants A,A2,D,E,F --reuse-dir $S/379-vectors --execute
node evaluations/382/score.mjs --snapshot $S/379-friend-6.json --texts eval-data/382-texts.json \
  --output eval-data/382-scores-small.json \
  --run A:A:eval-data/382-small:$S/379-query-vectors.json   # …one --run per variant
node evaluations/382/make-review.mjs --snapshot $S/379-friend-6.json --scores eval-data/382-scores-small.json \
  --prior $S/379-review.json --output eval-data/382-review.json
node evaluations/379/review.mjs --file eval-data/382-review.json      # blind human review
node evaluations/382/score-judgments.mjs --review $S/379-review.json --review eval-data/382-review.json \
  --scores eval-data/382-scores-small.json --output eval-data/382-precision.json
```

For another model, embed the queries with `embed.mjs --queries
evaluations/379/queries.json --output FILE --model text-embedding-3-large
--dims 1536`, and pass that file in the run's fourth field.

### Cost

`text-embedding-3-small`: 12,222 new texts and 3,997 reused from #379's A
cache, **524,542 billed tokens (≈ $0.0105** at $0.02/M).

### Results so far (`text-embedding-3-small`)

A reproduces #379 exactly, both on the playlist proxy and on precision.

Playlist proxy, using #379's 103 seeds:

| Run | recall@10 | MRR | recall@10, other releases | MRR, other releases |
| --- | --- | --- | --- | --- |
| A | 0.00942 | 0.0881 | 0.01012 | 0.0959 |
| A2 | 0.00918 | 0.0888 | 0.01012 | 0.0945 |
| D | **0.01035** | 0.1012 | **0.01446** | **0.1249** |
| E | 0.00935 | **0.1021** | 0.01375 | 0.1221 |
| F | 0.00878 | 0.0826 | 0.01154 | 0.0923 |

Without identifiers (D, E), MRR rises about 15% overall and about 30% once
same-release matches are excluded, so album leakage doesn't explain the gain.
Adding identifiers back (F) makes it the worst run. The proxy is noisy, so this
points a direction rather than deciding it.

Judged precision@10 with #379's 366 judgments only (before the new review):

| Run | Relevant | Not relevant | Uncertain | Unjudged | Bounds |
| --- | --- | --- | --- | --- | --- |
| A | 184 | 55 | 1 | 0 | 0.7667–0.7708 |
| A2 | 181 | 49 | 0 | 10 | 0.7542–0.7958 |
| D | 64 | 6 | 0 | 170 | 0.2667–0.9750 |
| E | 59 | 4 | 0 | 177 | 0.2458–0.9833 |
| F | 92 | 11 | 0 | 137 | 0.3833–0.9542 |

D, E and F mostly retrieve tracks that A/B/C never ranked. Their precision is
undetermined until `eval-data/382-review.json` (347 new pooled pairs, blinded)
is judged. A `text-embedding-3-large` comparison follows on the best text,
once those judgments are in.
