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

Judged precision@10 merges #379's 366 judgments with 342 new blinded ones.
The 382 review has 288 relevant, 54 not relevant and 5 left unjudged; review
SHA-256 `c7f5f53b586de312e3c4363faa93325054a0494c3207bbed7b51fc7b8c294027`.
Unjudged pairs widen the bounds; they are not counted as misses.

| Run | Relevant | Not relevant | Unresolved | Precision@10 | Scene | Style | Instr. | Crossover |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 184 | 55 | 1 | 0.7667–0.7708 | 0.750 | 0.733 | 0.717 | 0.867 |
| A2 | 187 | 53 | 0 | 0.7792 | 0.733 | 0.783 | 0.733 | 0.867 |
| D | 209 | 30 | 1 | 0.8708–0.8750 | **0.883** | 0.867 | 0.817 | 0.900 |
| E | 209 | 27 | 4 | 0.8708–0.8875 | 0.767 | **0.950** | 0.867 | 0.900 |
| F | 214 | 24 | 2 | **0.8917–0.9000** | 0.783 | 0.933 | 0.867 | **0.983** |

Group columns are lower bounds. Paired per query against A, with a 95%
bootstrap CI over queries on the mean precision difference:

| Comparison | Wins / losses / ties | Mean Δ precision@10 | 95% CI |
| --- | --- | --- | --- |
| A2 vs A | 5 / 2 / 17 | +0.013 | −0.008 to +0.033 |
| D vs A | 12 / 6 / 6 | +0.100 | −0.004 to +0.204 |
| E vs A | 13 / 7 / 4 | +0.104 | −0.008 to +0.217 |
| **F vs A** | **16 / 2 / 6** | **+0.125** | **+0.067 to +0.188** |
| F vs E | 7 / 4 / 13 | +0.021 | −0.063 to +0.100 |

Distinct releases per top 10, averaged over the queries: A 5.33, D 4.46,
E 3.00, F 3.25.

### Reading

- **The normalization fix (A2) is safe but not, by itself, a measurable gain.**
  It is still worth shipping as a correctness fix.
- **Identifiers hurt the descriptive signal.** Every text that drops or
  demotes title, artist, album and label beats A on queries by about 0.10–0.13.
- **Only F's gain is consistent across queries.** D and E win big on some
  queries (q04, q05, q18) and lose on others (q12, q14, q17), so their CIs
  cross zero. F leads with descriptors but keeps identifiers as trailing
  context, and loses only 2 of 24 queries to A.
- **The two use cases disagree.** On the playlist proxy (similar tracks), F is
  the worst run and D/E the best; on queries (natural-language retrieval), F is
  the best. That supports a separate retrieval text rather than one identity
  text serving both.
- **Descriptive texts cluster by album.** Tracks on one release share every
  descriptive field and therefore one vector, so a matching album can fill
  several top-10 slots (E averages 3 releases per top 10). Precision rewards
  that; a DJ browsing results may not. A serving design would need per-release
  diversification, or a track-level field (#371) to break ties.
- **Limitations:** one judge (the collection owner); 24 queries; one
  collection; the proxy is noisy; and the judge saw the playlist-proxy
  direction before reviewing (the review itself stayed blind per pair).

### Model comparison (`text-embedding-3-large`, truncated to 1536 dims)

A, D, E and F were embedded again on `text-embedding-3-large` with
`dimensions: 1536`, so the vectors fit the existing `vector(1536)` partial
ivfflat index pattern; native 3072 dims would exceed pgvector's 2,000-dim index
limit for `vector`. Queries were re-embedded with the same model (202 tokens).
The new pooled pairs got a third blind review: 284 pairs, 230 relevant, 54 not
relevant, none unresolved; SHA-256
`d92f9b364d3cf22a16a612726011dccf3f3451b017be7b200d037d537e2d1617`.

| Run | Precision@10 | Scene | Style | Instr. | Crossover | Releases per top 10 | Playlist MRR, other releases |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A-large | 0.7833 | 0.750 | 0.733 | 0.767 | 0.883 | 4.42 | 0.1003 |
| D-large | 0.8292 | 0.717 | 0.850 | 0.883 | 0.867 | 4.29 | 0.1101 |
| E-large | **0.9000** | 0.883 | 0.950 | 0.833 | 0.933 | 3.33 | **0.1440** |
| F-large | **0.9000** | 0.833 | 0.917 | 0.883 | 0.967 | 3.58 | 0.1229 |

Same text, large vs small (paired per query, 95% bootstrap CI):

| Comparison | Wins / losses / ties | Mean Δ | 95% CI |
| --- | --- | --- | --- |
| A-large vs A | 10 / 8 / 6 | +0.017 | −0.058 to +0.088 |
| D-large vs D | 8 / 9 / 7 | −0.042 | −0.108 to +0.021 |
| E-large vs E | 7 / 6 / 11 | +0.029 | −0.042 to +0.108 |
| F-large vs F | 6 / 7 / 11 | +0.008 | −0.033 to +0.054 |
| E-large vs A | 13 / 5 / 6 | +0.133 | +0.033 to +0.242 |
| F-large vs A | 16 / 2 / 6 | +0.133 | +0.058 to +0.213 |

**The model makes no measurable difference.** Every same-text comparison has a
CI spanning zero, with deltas between −0.04 and +0.03. The gains over A come
from the text, and `3-small` F (0.892–0.900) already matches E-large and F-large
(0.900). `3-large` costs 6.5× per token and offers no benefit to justify the
switch.

Cost: 581,084 billed tokens for the four large-model texts (≈ $0.0755 at
$0.13/M), plus 202 query tokens. **#382 total ≈ $0.086.** The character / 4
estimate *under*-counted billed tokens by about 15–20% on both runs.

## Recommendation

1. **Stay on `text-embedding-3-small`.** No model change, so #386's switch is
   not needed.
2. **Ship the normalization fix (A2)** as a correctness change. It is neutral
   on these metrics, but it stops accented tags being mangled for 18.8% of
   tracks and removes duplicate tags such as `Trip-Hop` / `trip hop` /
   `Trip‑hop`.
3. **Use the F text (descriptors first, identifiers last) for
   natural-language retrieval, as a new embedding type** rather than rewriting
   `identity`. F is the only text whose query gain is consistent (16 / 2 / 6
   against A, CI above zero), and a separate type avoids the template-version
   staleness and overwrite gaps listed above. Leave `identity` serving "similar
   tracks" for now. D and E look better on the playlist proxy, but that signal
   is too noisy to justify rewriting the serving vectors.
4. **Retrieval needs per-release diversification.** Descriptive texts put about
   3–3.5 releases in each top 10. Cap results per release, or wait for
   track-level descriptors (#371).
5. **The query endpoint is follow-up work.** These are offline numbers;
   `/api/tracks/search` is still lexical, and production still predates #393.
   Shipping natural-language search needs a query-embedding route, a merge with
   lexical results and filters, and query-cost controls.
