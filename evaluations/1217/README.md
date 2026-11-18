# #1217 — Beatmatcher needs a genre requirement

Part of #1190. Follows #1196 (PR #1209), where the owner preferred Selector to
Beatmatcher 16–1 ("which would you mix from this track?"), and #1218 (PR
#1221), which ranked similarity within the pool.

## Era and energy fit (new metrics)

`evaluations/1196/metrics.mjs` (`fitMetrics`), reported by `report.mjs` (its
"Era and energy fit" table) and `evaluations/1218/compare.mjs`:

- **Era fit:** the share of picks in the seed's era bucket (**same era**), in
  it or an adjacent one (**era ±1**), by the `era` signal's own
  `computeEraBucket` and `areErasAdjacent`; and the mean |Δyear| where both
  years are known (1900 on, as the buckets read them).
- **Energy fit:** the mean |Δenergy| between seed and pick, and the share
  within ±0.2 (the `energy_range` default). Energy is the ranker's
  (`calculateEnergy`: danceability and aggressive mood).
- Each over the picks where seed and pick both have the value; **known** is
  that share of the picks. `seedOf` (`run.mjs`) now carries the seed's `era`
  and `energy`, and `pickOf` a pick's, from the candidate metadata.

## Baseline (`main` after #1218, before any Beatmatcher change)

Every preset and internal config, on the frozen set (`seeds.json`, 34 + 5
seeds) and the holdout (`seeds-holdout.json`, 34 + 5). Means over seeds.

**Frozen:**

| Profile     | Starved | ±6% ½×/2× | \|ΔBPM\| ½×/2× | Compatible / same key | Genre | Vibe sim | Same era | Era ±1 | \|Δyear\| | \|Δenergy\| | Energy ±0.2 | Artists |
| ----------- | ------- | --------- | -------------- | --------------------- | ----- | -------- | -------- | ------ | --------- | ----------- | ----------- | ------- |
| Default     | 4       | 100%      | 2.5            | 100 / 56%             | 0.25  | 0.984    | 26%      | 56%    | 18.9      | 0.134       | 74%         | 9.2     |
| Beatmatcher | 2       | 100%      | 1.9            | 100 / 75%             | 0.27  | 0.980    | 26%      | 54%    | 19.8      | 0.146       | 72%         | 9.6     |
| Selector    | 0       | 59%       | 8.2            | 34 / 20%              | 0.66  | 0.977    | 50%      | 76%    | 11.7      | 0.112       | 82%         | 9.5     |
| blend       | 0       | 72%       | 4.1            | 51 / 40%              | 0.38  | 0.982    | 38%      | 64%    | 15.8      | 0.139       | 74%         | 9.6     |
| mixable     | 2       | 95%       | 2.3            | 75 / 48%              | 0.29  | 0.983    | 31%      | 57%    | 18.3      | 0.137       | 76%         | 9.3     |
| strict      | 17      | 100%      | 1.8            | 100 / 40%             | 0.47  | 0.977    | 29%      | 54%    | 19.2      | 0.151       | 72%         | 7.3     |

**Holdout:**

| Profile     | Starved | ±6% ½×/2× | \|ΔBPM\| ½×/2× | Compatible / same key | Genre | Vibe sim | Same era | Era ±1 | \|Δyear\| | \|Δenergy\| | Energy ±0.2 | Artists |
| ----------- | ------- | --------- | -------------- | --------------------- | ----- | -------- | -------- | ------ | --------- | ----------- | ----------- | ------- |
| Default     | 2       | 100%      | 2.6            | 100 / 70%             | 0.29  | 0.985    | 25%      | 49%    | 21.5      | 0.140       | 76%         | 9.3     |
| Beatmatcher | 2       | 100%      | 1.9            | 100 / 83%             | 0.30  | 0.982    | 25%      | 49%    | 21.5      | 0.144       | 74%         | 9.6     |
| Selector    | 0       | 63%       | 7.7            | 38 / 21%              | 0.69  | 0.981    | 52%      | 73%    | 12.9      | 0.111       | 84%         | 9.4     |
| blend       | 2       | 81%       | 3.7            | 56 / 46%              | 0.40  | 0.985    | 33%      | 61%    | 17.7      | 0.125       | 81%         | 9.5     |
| mixable     | 2       | 96%       | 2.3            | 78 / 57%              | 0.34  | 0.985    | 28%      | 52%    | 20.7      | 0.141       | 75%         | 9.3     |
| strict      | 12      | 100%      | 1.7            | 100 / 48%             | 0.48  | 0.981    | 27%      | 50%    | 21.7      | 0.132       | 77%         | 8.2     |

Era is known for 99–100% of picks and energy for 85–90%, for every profile.

**What it shows:** Beatmatcher's lists are no closer to the seed's era or
energy than Default's, and Selector's are much closer (same era 50% vs 26%,
|Δyear| 11.7 vs 19.8). The owner's preference for Selector in #1196 and in
#1218's second round lines up with that, not only with genre.

## Reproduce

On a worktree stack restored from the golden seed, with the `optimize`
profile (`just worktree-services add optimize`):

```bash
node --test evaluations/1196/*.test.mjs evaluations/1218/*.test.mjs
node evaluations/1196/run.mjs --out-dir eval-data/1217-base
node evaluations/1196/report.mjs --out-dir eval-data/1217-base
node evaluations/1196/run.mjs --out-dir eval-data/1217-base-holdout \
  --seeds evaluations/1196/seeds-holdout.json \
  --seeds-sha256 581c563b50eca6624218871aa870ef399d2f02a5e0e56dd000bb3ad70af474c7
node evaluations/1196/report.mjs --out-dir eval-data/1217-base-holdout
node evaluations/1218/compare.mjs --before eval-data/1217-base --after eval-data/1217-base
```

`eval-data/` is git-ignored; this README quotes aggregates only.
