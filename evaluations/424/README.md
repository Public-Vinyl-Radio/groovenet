# #424: what the per-release cap costs natural-language search

Live semantic search (#409) scored precision@10 0.775–0.779 on the 24 frozen
#379 queries, against 0.892–0.900 offline for the same `context` text.
Rebuilding the context ivfflat index changed no live result, which ruled out
the approximate index. `cap.mjs` isolates the per-release cap:

1. Exact cosine ranking over the #382 snapshot, using the app-built context
   text (`Fapp`, #408).
2. Cap at N tracks per release, for N = none, 3, 2 and 1.
3. Score the top 10 with the merged blind reviews.

Unjudged pairs widen the bounds, as in #382.

## Result

Five merged reviews: 379, 382, 382-large, 409 and 424 (69 new pairs).

| Cap | P@10 | scene | style | instrumentation | crossover | Releases per top 10 |
| --- | --- | --- | --- | --- | --- | --- |
| none | 0.900 | 0.800 | 0.933 | 0.867 | 1.000 | 3.25 |
| **3** | **0.854** | 0.783 | 0.850 | 0.850 | 0.933 | 5.08 |
| 2 | 0.800 | 0.733 | 0.767 | 0.783 | 0.917 | 6.29 |
| 1 | 0.733–0.738 | 0.633 | 0.717 | 0.733 | 0.850 | 10.00 |

Paired per query, with a 95% bootstrap CI:

| Comparison | Wins / losses / ties | Mean Δ | 95% CI |
| --- | --- | --- | --- |
| 3 vs 2 | 10 / 0 / 14 | +0.054 | +0.025 to +0.087 |
| none vs 3 | 7 / 2 / 15 | +0.046 | −0.008 to +0.108 |
| none vs 2 | 13 / 2 / 9 | +0.100 | +0.033 to +0.171 |

- **The cap explains the live gap.** Offline cap 2 (0.800) is within about 0.02 of live (0.78).
- **3 is strictly better than 2.** It never loses a query, and still shows about 5 releases per top 10.
- **Removing the cap isn't reliably better than 3,** and it collapses the top 10 to about 3 releases.

So `PER_RELEASE_CAP` is 3.

## Run

```bash
E=../epic-embeddings1/eval-data              # snapshot, 379 review, query vectors
S=../worktree-silver-harbor-49a7/eval-data   # #408 texts and vectors, later reviews
node evaluations/424/cap.mjs --snapshot $E/379-friend-6.json --texts $S/408-texts.json \
  --vectors $S/408-small --query-vectors $E/379-query-vectors.json \
  --review $E/379-review.json --review $S/382-review.json --review $S/382-review-large.json \
  --review $S/409-review.json --review $S/424-review.json \
  --output eval-data/424-caps.json --unjudged-output eval-data/424-review-new.json
```

- **Standard output** is the aggregate table.
- **`--output`** holds the private rankings (track IDs). Never commit it.
- **`--unjudged-output`** is a blind sheet for `evaluations/379/review.mjs`.
