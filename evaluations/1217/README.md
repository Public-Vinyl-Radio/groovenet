# #1217 — Beatmatcher needs a genre requirement

Part of #1190. Follows #1196 (PR #1209), where the owner preferred Selector to
Beatmatcher 16–1 ("which would you mix from this track?"), and #1218 (PR
#1221), which ranked similarity within the pool.

## Result: Beatmatcher leads with genre inside its constraints (pending review)

**Chosen: genre 0.9, era 0.3, energy 0.5** (`proposals/bm-g09-e03-n05.json`),
the rest unchanged: similarity 0.15 / 0.15 (max base), key 0.3, BPM 3, ±6%
with half and double time, compatible keys. The constraints keep every pick
mixable, so tempo and key fit stay at 100%; inside them, genre now outweighs
a key step (0.15) and the tempo spread (0.18).

**It is confirmed only if the owner's blind review prefers it** to `main`'s
Beatmatcher (below). The app change is in the PR so it can be reviewed as
it would ship; it is not adopted until then.

| Frozen set                                    | `main`     | Chosen     |
| --------------------------------------------- | ---------- | ---------- |
| Picks with **no genre overlap** with the seed | 43%        | **16%**    |
| Genre overlap                                 | 0.27       | 0.46       |
| Same era / era ±1                             | 26% / 54%  | 45% / 75%  |
| mean \|Δyear\|                                | 19.8       | 12.9       |
| ±6% ½×/2×, compatible key                     | 100%, 100% | 100%, 100% |
| Same key                                      | 75%        | 46%        |
| Starved seeds                                 | 2          | 2          |

Holdout: no-genre picks 36% → 10%, genre 0.30 → 0.51, same era 25% → 46%,
energy within ±0.2 74% → 82%, same key 83% → 49%, starved 2 → 2.

## Candidates

Built with `run.mjs --config name=file.json` (`proposals/`), each against
the same retrieved pools. Frozen set, then holdout:

| Candidate                | Genre / era / energy weights | Floor | Starved     | Genre       | No-genre picks | Same era  | Era ±1    | \|Δyear\|   | Energy ±0.2 | Same key  | \|ΔBPM\| ½×/2× |
| ------------------------ | ---------------------------- | ----- | ----------- | ----------- | -------------- | --------- | --------- | ----------- | ----------- | --------- | -------------- |
| `main`                   | 0.05 / – / 0.05              | –     | 2 · 2       | 0.27 · 0.30 | 43% · 36%      | 26% · 25% | 54% · 49% | 19.8 · 21.5 | 72% · 74%   | 75% · 83% | 1.9 · 1.9      |
| `bm-floor005`            | 0.05 / – / 0.05              | 0.05  | **10 · 7**  | 0.46 · 0.47 | 0% · 0%        | 28% · 27% | 53% · 49% | 20.1 · 21.6 | 68% · 78%   | 60% · 64% | 2.5 · 2.4      |
| `bm-floor02`             | 0.05 / – / 0.05              | 0.2   | **10 · 12** | 0.50 · 0.51 | 0% · 0%        | 28% · 29% | 55% · 52% | 19.1 · 20.3 | 68% · 78%   | 54% · 60% | 2.6 · 2.4      |
| `bm-g03`                 | 0.3 / 0.05 / 0.08            | –     | 2 · 2       | 0.39 · 0.44 | 26% · 19%      | 32% · 34% | 62% · 60% | 16.8 · 17.7 | 72% · 76%   | 66% · 69% | 2.1 · 2.1      |
| `bm-g03-floor005`        | 0.3 / 0.05 / 0.08            | 0.05  | **10 · 7**  | 0.51 · 0.52 | 0% · 0%        | 33% · 33% | 57% · 57% | 18.3 · 18.6 | 69% · 77%   | 55% · 58% | 2.6 · 2.4      |
| `bm-g06` (runner-up)     | 0.6 / 0.1 / 0.16             | –     | 2 · 2       | 0.46 · 0.50 | 16% · 10%      | 35% · 38% | 67% · 65% | 15.3 · 15.9 | 70% · 78%   | 54% · 57% | 2.5 · 2.3      |
| `bm-g06-floor005`        | 0.6 / 0.1 / 0.16             | 0.05  | **10 · 7**  | 0.54 · 0.55 | 0% · 0%        | 35% · 36% | 62% · 62% | 16.9 · 17.0 | 69% · 79%   | 49% · 52% | 2.7 · 2.5      |
| `bm-g06-genre-only`      | 0.6 / – / 0.05               | –     | 2 · 2       | 0.46 · 0.50 | 15% · 9%       | 28% · 32% | 58% · 58% | 17.8 · 18.3 | 68% · 75%   | 55% · 59% | 2.4 · 2.3      |
| `bm-g06-e02-n03`         | 0.6 / 0.2 / 0.3              | –     | 2 · 2       | 0.44 · 0.50 | 19% · 12%      | 44% · 44% | 74% · 71% | 13.0 · 14.1 | 72% · 80%   | 53% · 54% | 2.5 · 2.3      |
| `bm-g06-e03-n05`         | 0.6 / 0.3 / 0.5              | –     | 2 · 2       | 0.42 · 0.48 | 22% · 14%      | 48% · 49% | 78% · 74% | 11.8 · 12.8 | 74% · 83%   | 53% · 53% | 2.6 · 2.4      |
| **`bm-g09-e03-n05`**     | **0.9 / 0.3 / 0.5**          | –     | 2 · 2       | 0.46 · 0.51 | 16% · 10%      | 45% · 46% | 75% · 72% | 12.9 · 13.7 | 72% · 82%   | 46% · 49% | 2.8 · 2.5      |
| `bm-g09`                 | 0.9 / 0.15 / 0.24            | –     | 2 · 2       | 0.48 · 0.52 | 13% · 8%       | 37% · 40% | 67% · 66% | 15.1 · 15.6 | 69% · 79%   | 47% · 50% | 2.7 · 2.4      |
| `bm-g12-e04-n06`         | 1.2 / 0.4 / 0.6              | –     | 2 · 2       | 0.47 · 0.52 | 15% · 9%       | 45% · 48% | 75% · 73% | 12.6 · 13.2 | 72% · 81%   | 43% · 46% | 2.9 · 2.6      |
| Selector (for reference) | 1.8 / 0.3 / 0.48             | –     | 0 · 0       | 0.66 · 0.69 | 2% · 1%        | 50% · 52% | 76% · 73% | 11.7 · 12.9 | 82% · 84%   | 20% · 21% | 8.2 · 7.7      |

Every candidate keeps 100% of picks within ±6% (½×/2×) and compatible keys:
the constraints are unchanged. "No-genre picks" is the share of picks whose
`genre_overlap` with the seed is 0, the failure the owner named in #1196.

**Why a weight, not a floor.** A `genre_floor` removes every no-genre pick,
but any floor starves 7–12 of 39 seeds (from 2), with 0–8 picks. They are
real seeds at slow and fast tempos, not only seeds without genres: in the
±6% and compatible-key pool, half the candidates share no genre with the
seed (median overlap 0.01 frozen, 0.20 holdout). A floor is a hard filter
with no toggle in the panel, so those seeds would show near-empty lists. A
floor that relaxes when it starves would need a ranker change; not done.

**Why 0.9 / 0.3 / 0.5.**

- **Genre saturates near 0.5** inside the window: 0.6 gets most of it, and
  0.9 and 1.2 add little. So genre 0.6–0.9 is where the pull stops paying.
- **Era moves only with its own weight.** At the same genre overlap,
  genre-only gives same era 28% and Selector's proportions 35%; era 0.3
  reaches 45–48%, Selector's level (50%). This is #1218's finding: move era
  and energy with genre. #1218's round 1 lost with genre alone.
- **0.9 over 0.6 at era 0.3 / energy 0.5:** 0.6 leaves 22% no-genre picks
  (14% holdout); 0.9 brings that back to 16% (10%), keeping the era gain.
- **Energy barely moves** at any weight: the energy signal spreads little
  within one tempo window. Holdout 74% → 82%; frozen unchanged.
- **The cost is same key, 75% → 46%.** Every pick is still a compatible key
  (same, adjacent or relative); fewer are the seed's own key. #1196's owner
  note was about genre, not key, so the review decides whether that cost is
  worth it.

## Blind review: new Beatmatcher vs `main`'s (for the owner)

**Seeds no round has shown.** #1196 showed 20 frozen seeds; #1218's rounds
showed all 39 holdout seeds. The review uses **the other 19 frozen seeds**,
every one of them, so the sample is fixed by that rule and can't be chosen
on results. Frozen in `review-seeds.json` (**SHA-256
`0fc28415fa3ee9fecd18b01ecb30b48a7c903b8376225788957cbbcf0f2d8273`**),
committed (e223c760) before the review lists were built, and checked by
`review-pair.test.mjs`. Disclosure: the candidates were tuned on aggregate
metrics over the whole frozen and holdout sets, these 19 seeds included;
no per-seed list was read.

- **Lists:** `main`'s Beatmatcher (`eval-data/1217-base`, before any change)
  and the chosen config. `review-pair.mjs pair` names them
  `beatmatcher-main` and `beatmatcher-genre`.
- **Sheet:** 17 items, plus 2 automatic ties where both lists are identical.
  Mean Jaccard between the two lists over the 19 seeds is 0.44.
- **Questions:** the same two, **Which would you mix from this track?** and
  **Which makes the more interesting set?**

```bash
node evaluations/1196/review-web.mjs --file eval-data/1217-review/bm-g09-e03-n05/review.json \
  --audio-base https://groovenet.home.arpa      # then open http://127.0.0.1:8196/
# when done
node evaluations/1196/score-review.mjs --sheet eval-data/1217-review/bm-g09-e03-n05/review.json \
  --key eval-data/1217-review/bm-g09-e03-n05/review-key.json \
  --output eval-data/1217-review/bm-g09-e03-n05/review-score.json
```

**If the review prefers `main`:** the runner-up is `bm-g06` (genre 0.6, era
0.1, energy 0.16: Selector's #1192 proportions at a third of its genre). It
is the gentler move: the same genre gain (0.46 / 0.50) and no-genre share
(16% / 10%), less era (35% / 38%), and more same key kept (54% / 57%). Its
sheet is built from the same seeds and ready, 15 items and 4 automatic ties
(Jaccard with `main` 0.55):

```bash
node evaluations/1196/review-web.mjs --file eval-data/1217-review/bm-g06/review.json \
  --audio-base https://groovenet.home.arpa
node evaluations/1196/score-review.mjs --sheet eval-data/1217-review/bm-g06/review.json \
  --key eval-data/1217-review/bm-g06/review-key.json
```

It reuses this round's seeds, so it should be reviewed in a fresh sitting,
or (cleaner) after a new holdout draw. If both lose, Beatmatcher stays as
`main` has it and the PR is reverted to the metrics only.

Building the sheets (already done; refuses to overwrite):

```bash
node evaluations/1196/run.mjs --out-dir eval-data/1217-review --profiles beatmatcher --no-ordering \
  --config bm-g09-e03-n05=evaluations/1217/proposals/bm-g09-e03-n05.json \
  --config bm-g06=evaluations/1217/proposals/bm-g06.json
node evaluations/1217/review-pair.mjs pair --before eval-data/1217-base/results.json \
  --before-profile beatmatcher --after eval-data/1217-review/results.json \
  --after-profile bm-g09-e03-n05 --output eval-data/1217-review/bm-g09-e03-n05/review-results.json
node evaluations/1196/side-by-side.mjs --results eval-data/1217-review/bm-g09-e03-n05/review-results.json \
  --output eval-data/1217-review/bm-g09-e03-n05/review.json \
  --key eval-data/1217-review/bm-g09-e03-n05/review-key.json \
  --compare beatmatcher-main:beatmatcher-genre --sample 19
```

## Before → after, every preset (`main` → this branch)

The live preset reproduces the chosen config's lists on all 39 frozen seeds.
Default's and Selector's lists, and the internal configs', are identical
before and after. Frozen · holdout:

| Profile         | ±6% ½×/2×   | Compatible / same key               | Era: same / ±1 / \|Δyear\|                                                      | Energy: \|Δ\| / ±0.2                                | Genre                         | Vibe sim                  | Artists           | Starved |
| --------------- | ----------- | ----------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------- | ------------------------- | ----------------- | ------- |
| Default         | 100% · 100% | 100 / 56% · 100 / 70%               | 26 / 56% / 18.9 · 25 / 49% / 21.5                                               | 0.134 / 74% · 0.140 / 76%                           | 0.25 · 0.29                   | 0.984 · 0.985             | 9.2 · 9.3         | 4 · 2   |
| **Beatmatcher** | 100% · 100% | 100 / 75→**46%** · 100 / 83→**49%** | 26→**45** / 54→**75%** / 19.8→**12.9** · 25→**46** / 49→**72%** / 21.5→**13.7** | 0.146→0.145 / 72→72% · 0.144→**0.115** / 74→**82%** | 0.27→**0.46** · 0.30→**0.51** | 0.980→0.973 · 0.982→0.974 | 9.6→9.6 · 9.6→9.4 | 2 · 2   |
| Selector        | 59% · 63%   | 34 / 20% · 38 / 21%                 | 50 / 76% / 11.7 · 52 / 73% / 12.9                                               | 0.112 / 82% · 0.111 / 84%                           | 0.66 · 0.69                   | 0.977 · 0.981             | 9.5 · 9.4         | 0 · 0   |
| blend           | 72% · 81%   | 51 / 40% · 56 / 46%                 | 38 / 64% / 15.8 · 33 / 61% / 17.7                                               | 0.139 / 74% · 0.125 / 81%                           | 0.38 · 0.40                   | 0.982 · 0.985             | 9.6 · 9.5         | 0 · 2   |
| mixable         | 95% · 96%   | 75 / 48% · 78 / 57%                 | 31 / 57% / 18.3 · 28 / 52% / 20.7                                               | 0.137 / 76% · 0.141 / 75%                           | 0.29 · 0.34                   | 0.983 · 0.985             | 9.3 · 9.3         | 2 · 2   |
| strict          | 100% · 100% | 100 / 40% · 100 / 48%               | 29 / 54% / 19.2 · 27 / 50% / 21.7                                               | 0.151 / 72% · 0.132 / 77%                           | 0.47 · 0.48                   | 0.977 · 0.981             | 7.3 · 8.2         | 17 · 12 |

- **Beatmatcher's mean |ΔBPM| (½×/2×)** rises 1.9 → 2.8 (holdout 1.9 →
  2.5), all within the ±6% window. Vibe similarity falls 0.980 → 0.973:
  genre now outranks the similarity tie-break.
- **Overlap:** Beatmatcher–Selector Jaccard 0.09 → 0.17 (holdout 0.08 →
  0.19); Default–Beatmatcher 0.49 → 0.32 (0.49 → 0.25).
- **Claims** (`report.mjs`): "Beatmatcher beats Selector on BPM and key"
  passes before and after. Selector's claim is reworded to **"vibe and genre
  first"** (vibe similarity and genre overlap; #1196 tested vibe and
  diversity, and it failed). It now passes on both sets, but only because
  Beatmatcher's vibe fell below Selector's; Selector didn't change. On
  `main`'s Beatmatcher it fails on vibe (0.977 vs 0.980) and passes on genre.
- **Ordering** (per transition, frozen; holdout alike): Beatmatcher keeps
  fewer ½×/2× jumps and key clashes than Selector in every mode, on both
  sets (greedy 5.3 vs 11.8 BPM, 0.48 vs 0.73 clashes; genetic 9.7 vs 13.8,
  0.55 vs 0.73; cohesive_blocks 7.2 vs 13.1, 0.56 vs 0.76). ga-service's
  translation moves metadata 0.013 → 0.173 and energy 0.013 → 0.096; on its
  pinned fixture only the genetic ordering moves. Default's genetic numbers
  differ between the two runs only because genetic is randomised.

## Method: era and energy fit (new metrics)

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
