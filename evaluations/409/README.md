# #409 — live spot-check of natural-language search

#382 measured the `context` text offline: exact cosine search over a frozen
4,000-track snapshot of friend 6, with no per-release cap. #409 shipped it
behind `/api/tracks/search?mode=semantic|hybrid`. This script asks the deployed
endpoint the same 24 frozen queries (`evaluations/379/queries.json`) and scores
the top 10 against the same blind judgments.

**Live numbers are not offline numbers.** They differ in three ways:

- The collection has changed since the snapshot.
- The index is approximate (ivfflat, `probes = 10`).
- Live results are capped at two per release.

Tracks that no review has judged widen the bounds and are never counted as
misses. Empty slots in a top 10 do count as misses.

## Run

Run this only once `GET /api/embeddings/status` shows `missing.context` at 0.
The script refuses to run before then unless you pass `--allow-incomplete`. It
reads the CLI's config (`~/.config/groovenet`) for the API base and TLS.

```bash
E=../epic-embeddings1/eval-data          # 379 review
S=../worktree-silver-harbor-49a7/eval-data  # 382 reviews, 408 scores
node evaluations/409/spot-check.mjs \
  --review $E/379-review.json --review $S/382-review.json --review $S/382-review-large.json \
  --offline-scores $S/408-scores.json --offline-label F \
  --output eval-data/409-live.json --unjudged-output eval-data/409-review.json
```

- **Standard output** is a Markdown table of aggregates for the issue:
  - precision@10 bounds;
  - per-group lower bounds;
  - unjudged and empty slots;
  - the largest number of tracks from one release in any top 10;
  - top-10 overlap with offline F.

  It contains no track names.
- **`--output`** keeps the full rankings with track IDs. It is private, so keep
  it in `eval-data/` and never commit or upload it.
- **`--unjudged-output`** writes a blind sheet of the pairs that no review has
  judged yet. Judge it with `node evaluations/379/review.mjs --file
  eval-data/409-review.json`, then rerun with an extra `--review` to tighten
  the bounds.

The 24 queries are embedded once each. Semantic and hybrid share the query
cache, so a run stays under the 30-a-minute rate limit. If it hits a 429 anyway,
the script waits a minute and retries once.

```bash
node --test evaluations/409/*.test.mjs
```
