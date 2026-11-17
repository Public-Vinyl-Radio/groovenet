# #1218 — similarity signals ranked within the candidate pool

Follow-up to the #1196 profile evaluation (`evaluations/1196/`), part of
#1190. Same harness, same frozen seeds (`seeds.json`, SHA-256 `a6ce1f66…6be2`),
same holdout (`seeds-holdout.json`, `581c563b…74c7`), same metrics. Every
number below is a mean over seeds from `just eval-profiles`, before
(`main` at 29534d1e) and after this branch. Aggregates only; raw results stay
in git-ignored `eval-data/1218*`.

## What changed

Identity and vibe similarity are `1 − d/2` of the cosine distance. In a seed's
pool (identity top 200 ∪ vibe top 200) that bunches:

| Raw similarity in a pool (frozen set) | Pools | p10–p90 | min to max | min–max: share of [0, 1] the middle 80% gets | min–max: where the median lands |
| ------------------------------------- | ----- | ------- | ---------- | -------------------------------------------- | ------------------------------- |
| vibe                                  | 35    | 0.0050  | 0.0102     | 50%                                          | 0.20                            |
| identity                              | 39    | 0.0393  | 0.1283     | 35%                                          | 0.09                            |

So any other weight drowned vibe, the `max(identity, vibe)` base always picked
vibe, and an identity-only candidate lost to every vibe candidate.

Now each similarity is **ranked within the candidates scored together**
(`poolRank` in `src/lib/ranking/signals.ts`). A candidate's value is the
share of the other candidates it is at least as similar as: best 1, worst 0,
ties share the higher rank, a pool of one (or all equal) is 1, null stays
null and isn't counted. It is computed once per request over every candidate,
before constraints, so a filter toggle never rescales the rest. The raw value
is the breakdown's `detail`.

**The base rule.** `max(w_identity × identity_rank, w_vibe × vibe_rank)`, the
same `max` as before, now on ranks. Each index's closest match scores 1, so a
candidate only the identity index found competes on its identity rank alone,
on equal terms with the vibe index's candidates. A candidate both indexes
found takes the better of its two ranks. Null means "outside that index's top
200", which is where a rank of 0 would put it anyway.

### Rank, not min–max

Both were run through the harness with the presets unchanged (frozen set):

| Profile  | Metric          | `main`        | rank          | min–max       |
| -------- | --------------- | ------------- | ------------- | ------------- |
| Selector | genre overlap   | 0.65          | 0.48          | 0.39          |
| Selector | vibe similarity | 0.977         | 0.982         | 0.983         |
| Selector | identity sim.   | 0.576         | 0.571         | 0.557         |
| blend    | identity sim.   | 0.570         | 0.566         | 0.543         |
| mixable  | identity sim.   | 0.550         | 0.533         | 0.524         |
| Default  | Jaccard vs main | 1             | 0.68          | 0.70          |
| Default  | vibe / identity | 0.984 / 0.505 | 0.984 / 0.520 | 0.984 / 0.516 |

They agree on most metrics. Where they differ, min–max pushes picks away from
identity, which is what the spread table predicts. The top of a pool is
stretched by a few near-duplicates (another pressing of the same track at
~0.95+ identity), so min–max puts the median identity candidate at 0.09 and the
median vibe candidate at 0.20. The `max` base then prefers vibe again, by a
margin that changes from seed to seed. Ranks give every pool the same even
spread, so a weight of 1 means "best to worst in the pool" on every seed. That
matches the other [0, 1] signals. The cost is that ranks discard gaps: a clear
best match and a near-tie both become one rank step. With 200 bunched
candidates that information was mostly noise.

### Ordering (ga-service)

ga-service's embedding term had the same compression: within a playlist the
pairs' `(cos + 1) / 2` spans 0.02–0.05 (p10–p90), with one exact duplicate at
1.0. `ranking.version` 2 ranks the term over the request's track pairs
(`pool_rank`, the same rule). It ranks globally rather than per row because
the optimiser compares whole orderings, so a pair should outrank another pair
anywhere in the playlist. Requests without `ranking` (Default) and version 1
are unchanged, so `test_pinned_orderings.py` doesn't move.

## Presets: before → after

Frozen set (34 track + 5 playlist seeds):

| Profile                   | Starved | ±6% ½×/2×   | mean \|ΔBPM\| ½×/2× | Compatible key | Same key  | Genre       | Vibe sim      | Identity sim  | Artists   | Releases    | Identity-only picks | Jaccard vs main |
| ------------------------- | ------- | ----------- | ------------------- | -------------- | --------- | ----------- | ------------- | ------------- | --------- | ----------- | ------------------- | --------------- |
| default                   | 4 → 4   | 100% → 100% | 2.6 → 2.5           | 100% → 100%    | 78% → 56% | 0.22 → 0.25 | 0.984 → 0.984 | 0.505 → 0.520 | 9.3 → 9.2 | 9.3 → 9.3   | 17% → 23%           | 0.68            |
| beatmatcher               | 2 → 2   | 100% → 100% | 1.8 → 1.9           | 100% → 100%    | 76% → 75% | 0.29 → 0.27 | 0.980 → 0.980 | 0.511 → 0.517 | 9.6 → 9.6 | 9.8 → 9.8   | 19% → 23%           | 0.73            |
| selector                  | 0 → 0   | 54% → 59%   | 8.6 → 8.2           | 28% → 34%      | 15% → 20% | 0.65 → 0.66 | 0.977 → 0.977 | 0.576 → 0.586 | 9.4 → 9.5 | 10.0 → 10.0 | 10% → 22%           | 0.39            |
| selector, round 1 re-tune | 0 → 0   | 54% → 65%   | 8.6 → 7.0           | 28% → 35%      | 15% → 22% | 0.65 → 0.64 | 0.977 → 0.980 | 0.576 → 0.572 | 9.4 → 9.6 | 10.0 → 10.0 | 10% → 16%           | 0.36            |
| blend                     | 0 → 0   | 68% → 72%   | 4.8 → 4.1           | 59% → 51%      | 39% → 40% | 0.57 → 0.38 | 0.979 → 0.982 | 0.570 → 0.566 | 9.6 → 9.6 | 10.0 → 10.0 | 12% → 29%           | 0.17            |
| mixable                   | 2 → 2   | 96% → 95%   | 2.6 → 2.3           | 77% → 75%      | 45% → 48% | 0.45 → 0.29 | 0.980 → 0.983 | 0.550 → 0.533 | 9.3 → 9.3 | 9.6 → 9.6   | 16% → 24%           | 0.32            |
| strict                    | 17 → 17 | 100% → 100% | 1.9 → 1.8           | 100% → 100%    | 43% → 40% | 0.50 → 0.47 | 0.978 → 0.977 | 0.552 → 0.554 | 7.3 → 7.3 | 7.5 → 7.5   | 24% → 33%           | 0.68            |

Holdout (seeds the re-tune never saw):

| Profile                   | Starved | ±6% ½×/2×   | mean \|ΔBPM\| ½×/2× | Compatible key | Same key  | Genre       | Vibe sim      | Identity sim  | Artists   | Identity-only picks | Jaccard vs main |
| ------------------------- | ------- | ----------- | ------------------- | -------------- | --------- | ----------- | ------------- | ------------- | --------- | ------------------- | --------------- |
| default                   | 2 → 2   | 100% → 100% | 2.8 → 2.6           | 100% → 100%    | 85% → 70% | 0.25 → 0.29 | 0.986 → 0.985 | 0.504 → 0.518 | 9.4 → 9.3 | 14% → 21%           | 0.72            |
| beatmatcher               | 2 → 2   | 100% → 100% | 1.8 → 1.9           | 100% → 100%    | 84% → 83% | 0.29 → 0.30 | 0.982 → 0.982 | 0.507 → 0.513 | 9.6 → 9.6 | 18% → 21%           | 0.71            |
| selector                  | 0 → 0   | 59% → 63%   | 8.5 → 7.7           | 34% → 38%      | 16% → 21% | 0.71 → 0.69 | 0.979 → 0.981 | 0.574 → 0.577 | 9.3 → 9.4 | 10% → 14%           | 0.45            |
| selector, round 1 re-tune | 0 → 0   | 59% → 64%   | 8.5 → 7.0           | 34% → 41%      | 16% → 25% | 0.71 → 0.67 | 0.979 → 0.983 | 0.574 → 0.563 | 9.3 → 9.6 | 10% → 11%           | 0.39            |
| blend                     | 2 → 2   | 73% → 81%   | 4.6 → 3.7           | 60% → 56%      | 39% → 46% | 0.63 → 0.40 | 0.981 → 0.985 | 0.570 → 0.561 | 9.4 → 9.5 | 15% → 28%           | 0.23            |
| mixable                   | 2 → 2   | 94% → 96%   | 2.6 → 2.3           | 79% → 78%      | 45% → 57% | 0.54 → 0.34 | 0.981 → 0.985 | 0.549 → 0.533 | 9.2 → 9.3 | 13% → 21%           | 0.33            |
| strict                    | 12 → 12 | 100% → 100% | 1.8 → 1.7           | 100% → 100%    | 46% → 48% | 0.53 → 0.48 | 0.980 → 0.981 | 0.550 → 0.551 | 8.2 → 8.2 | 22% → 26%           | 0.66            |

`selector` is the preset as it is now, on the fallback weights (genre 1.8),
after the round 1 blind review. The round 1 re-tune (genre 1.6) is kept for
comparison. The overlap and verdict lines below are from the round 1 run.

Vibe and identity similarity are exact cosine (`1 − d`) on the serving
embeddings, as in #1196. "Same key" is the share of picks in the seed's own
key; "identity-only picks" is the share the identity index alone found.

**Overlap between profiles** (frozen set, mean Jaccard at 10, `main` → after):
Default–Beatmatcher 0.52 → 0.49, Default–Selector 0.03 → 0.10,
Beatmatcher–Selector 0.10 → 0.10, Selector–blend 0.35 → 0.16,
Default–mixable 0.28 → 0.60.

**Verdicts** (#1196's rules, unchanged): Beatmatcher's BPM and key claim
still passes on every metric (100% vs 65% within ±6%, 100% vs 35% compatible).
Selector's "vibe and diversity" claim still fails, but closer: vibe is now a
near tie at 0.980 each, where Selector edges the mean but loses per seed, 8–22
(it lost 0.977 vs 0.980 before). Artists are 9.59 vs 9.62. As #1196 found, that claim doesn't describe what the
owner values in Selector, and #1217 is rewording it.

### Ordering, frozen set (per transition, mean over the 5 playlists)

| Mode            | Profile     | ½×/2× BPM jump | Key clashes | Vibe distance     |
| --------------- | ----------- | -------------- | ----------- | ----------------- |
| greedy          | default     | 8.2 → 8.2      | 0.66 → 0.66 | 0.042 → 0.042     |
| greedy          | beatmatcher | 5.2 → 5.0      | 0.48 → 0.49 | 0.043 → 0.042     |
| greedy          | selector    | 12.7 → 11.9    | 0.75 → 0.76 | 0.040 → **0.034** |
| genetic         | default     | 8.5 → 8.6      | 0.80 → 0.82 | 0.047 → 0.046     |
| genetic         | beatmatcher | 9.5 → 9.3      | 0.58 → 0.58 | 0.048 → 0.048     |
| genetic         | selector    | 14.7 → 13.9    | 0.81 → 0.73 | 0.044 → **0.039** |
| cohesive_blocks | default     | 10.1 → 10.1    | 0.68 → 0.68 | 0.045 → 0.045     |
| cohesive_blocks | beatmatcher | 6.5 → 6.8      | 0.58 → 0.60 | 0.044 → 0.044     |
| cohesive_blocks | selector    | 15.3 → 13.0    | 0.81 → 0.82 | 0.045 → **0.036** |

Default doesn't move (it sends no `ranking`; genetic is randomised, so treat
differences under ~1 BPM as noise). Selector's vibe distance drops in every
mode on both sets (holdout: 0.039 → 0.034, 0.042 → 0.035, 0.039 → 0.036). That
includes cohesive_blocks, which was the one mode × set cell #1196's ordering
expectation failed. Beatmatcher holds.

## The preset changes

| Preset                 | `main`                                                                      | After                                                                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Default                | identity 1, vibe 1 (max base), key 0.02, BPM 0.01                           | unchanged                                                                                                                                                                                  |
| Beatmatcher            | identity 0.5, vibe 0.5 (max base), key 0.3, BPM 3, genre 0.05, energy 0.05  | identity **0.15**, vibe **0.15** (max base); the rest unchanged                                                                                                                            |
| Selector               | identity 0.8, vibe 1 (max base), genre 0.3, era 0.05, energy 0.08, BPM 0.01 | vibe 1 (**added, no base**), identity **0**, genre **1.8**, era **0.3**, energy **0.48**, BPM 0.01 (the fallback, after round 1; round 1 reviewed genre 1.6 with era and energy unchanged) |
| blend, mixable, strict | Default's similarity, key and tempo, plus genre 0.08 and era 0.02           | unchanged                                                                                                                                                                                  |

### Selector: still genre-led

The owner chose genre-led Selector in #1196 (16–1 and 14–3). So the target was
to keep its genre pull while vibe starts to count. Sweep on the frozen set
(`proposals/selector-*.json`, compared with `main`'s Selector):

| Config                      | Rule          | Identity | Genre | Genre overlap | Vibe sim  | Identity-only picks | Jaccard vs main |
| --------------------------- | ------------- | -------- | ----- | ------------- | --------- | ------------------- | --------------- |
| `main`                      | max base, raw | 0.8      | 0.3   | 0.65          | 0.977     | 10%                 | 1               |
| unchanged weights           | max base      | 0.8      | 0.3   | 0.48          | 0.982     | 21%                 | 0.12            |
| `g1`                        | max base      | 0.8      | 1     | 0.68          | 0.967     | 49%                 | 0.19            |
| `g2`                        | max base      | 0.8      | 2     | 0.72          | 0.962     | 59%                 | 0.22            |
| `max-i05-g1`                | max base      | 0.5      | 1     | 0.63          | 0.977     | 26%                 | 0.25            |
| `add-i03-g1`                | added         | 0.3      | 1     | 0.59          | 0.981     | 15%                 | 0.31            |
| `add-i03-g16`               | added         | 0.3      | 1.6   | 0.66          | 0.975     | 26%                 | 0.36            |
| `add-i0-g14`                | added         | 0        | 1.4   | 0.62          | 0.981     | 16%                 | 0.36            |
| `add-i0-g16-lite` (round 1) | added         | 0        | 1.6   | **0.64**      | **0.980** | **16%**             | 0.36            |
| **`add-i0-g18`** (now)      | added         | 0        | 1.8   | **0.66**      | **0.977** | **22%**             | **0.39**        |

(`-lite` keeps `main`'s era 0.05 and energy 0.08; the others scale them with
genre.)

- **Over a `max` base, genre can't lead without flooding the lists with
  identity-only tracks.** The identity index is itself genre-heavy. Once
  genre leads, its candidates win (39–65% of picks), and vibe falls _below_
  `main`'s. Adding vibe instead keeps them to 10–16%: a track outside the vibe
  top 200 scores no vibe, which is the rank it has.
- **The round 1 point** keeps `main`'s genre pull (0.64 against 0.65), lifts vibe
  0.977 → 0.980 and artists 9.4 → 9.6, and changes only two things against
  `main`: genre is rescaled for the new spread and vibe adds. On the holdout,
  vibe rises 0.979 → 0.983 and artists 9.3 → 9.6, but genre gives up a little
  more (0.71 → 0.67). It is a trade, not a strict win, which is why the blind
  review decides.
- On the #1192 preset fixture the round 1 re-tune ordered exactly as `main`'s
  did. The fallback swaps two neighbours there (`genre-match-two-steps` now
  precedes `calm-vibe`), because genre pulls harder.

### Beatmatcher: BPM and key held

At 0.5 on the new scale, similarity spans 0.5 and outweighs tempo (0.18 in the
window) and key (0.15 a step). Same key fell 76% → 68% and |ΔBPM| rose 1.8 →
2.2. Sweep: similarity 0.05 / 0.1 / 0.15 / 0.25 gave same key 76 / 76 / 75 /
71% and |ΔBPM| 1.8 / 1.9 / 1.9 / 2.1. **0.15** is the largest weight that holds
both, and similarity then breaks ties between tracks equal in tempo and key.
100% within ±6% (½×/2×) and 100% compatible hold (they are constraints), on
both seed sets. Its genre (0.27–0.30) is #1217's problem and was not tuned.

### Default: different, mostly as described

Default keeps 68–72% of its picks. On `main`, its key (+0.02) and tempo
(+0.01) boosts were bigger than the whole vibe spread, so it sorted by key,
then tempo, then similarity. Now similarity leads and the boosts break
near-ties, which is what its description ("the closest identity or vibe
match, with a small boost for key and tempo") always said. Identity
similarity and genre rise slightly, and identity-only picks go 17% → 23%.
Same-key share falls (78% → 56%), but every pick is still compatible: its
toggle filters that. It hasn't been reviewed, so I'd call it **different and
truer to its description**, not shown to be better.

### Internal configs

blend, mixable and strict inherit Default's weights. Their genre bonus (0.08)
is now a bonus beside similarity rather than the thing that sorted them: genre
overlap 0.57 → 0.38 (blend) and 0.45 → 0.29 (mixable). That is the pre-scorer's
intent. strict still starves on 17 of 39 seeds (12 of 39 on the holdout); its
key rule, ±4 BPM and genre floor all bite, as #1220 found. Not redesigned here.

## Stored and shared profiles

- **Stored rows:** the prod-seeded worktree database (seed 2026-11-15) has **no**
  `ranking_profiles` rows. The one selection (friend 6, `related` → `selector`)
  names a preset, which lives in code.
- **Shared files and stored rows still carry meaning:** a v1 weight on
  similarity scaled a raw `1 − d/2`. The ranking schema version is now **2**. A
  v1 file imports with its weights kept and a warning; no rescaling reproduces
  a raw-similarity ranking on ranks. Stored v1 rows take the same step in
  migration `1794800000000_ranking-profiles-pool-similarity`, which does nothing
  on prod today. The alternative was leaving them at v1, where they would no
  longer parse, would rank as Default, and the editor would show Default's
  weights instead of their own.

## Blind review, round 2: fallback Selector vs `main`'s (for the owner)

Not judged yet. **Selector's new weights are confirmed only once the owner's
review agrees.**

- **Why a round 2:** round 1 (below) preferred `main` to the re-tune, so
  Selector moved to the fallback, `proposals/selector-add-i0-g18.json`.
- **Seeds:** the 19 holdout seeds round 1 did not show, frozen in
  `review-seeds-2.json` (SHA-256 `d9d6528d…ad00b`). Committed (aef996a2) before
  any fallback list existed. Round 1 showed `main`'s lists for its 20 seeds,
  so reusing them could be recognised.
- **Lists:** `main`'s Selector from the holdout run on `main`, and the
  fallback from this branch. `review-pair.mjs pair --round 2` joins them as
  `selector-main` and `selector-fallback`.
- **Sheet:** the same tooling and questions: 17 items, plus 2 automatic ties
  where both lists are identical. Mean Jaccard between the two lists is 0.45.

```bash
node evaluations/1196/review-web.mjs --file eval-data/1218-r2/review.json \
  --audio-base https://groovenet.home.arpa      # then open http://127.0.0.1:8196/
# afterwards
node evaluations/1196/score-review.mjs --sheet eval-data/1218-r2/review.json \
  --key eval-data/1218-r2/review-key.json --output eval-data/1218-r2/review-score.json
```

To rebuild the sheet:

```bash
node evaluations/1218/review-pair.mjs pair --round 2 \
  --before eval-data/1218-holdout-before/results.json \
  --after eval-data/1218-holdout-after2/results.json \
  --output eval-data/1218-r2/review-results.json
node evaluations/1196/side-by-side.mjs --results eval-data/1218-r2/review-results.json \
  --output eval-data/1218-r2/review.json --key eval-data/1218-r2/review-key.json \
  --compare selector-main:selector-fallback --sample 19
```

**If round 2 also prefers `main`:** nothing on the ranked scale reproduces
`main`'s Selector. The choice is then between keeping Selector on raw
similarity (a per-config opt-out of pool ranking) or holding the Selector
change until #1217. Neither should be decided here.

## Blind review, round 1: re-tuned Selector vs `main`'s

**Result: the owner preferred `main`, 11–5 on both questions** (17 of 20
reviewed, 1 "no difference", 3 skipped; sign test p = 0.21 each). The two
answers agreed on every seed. That is not significant alone, but the re-tune
needed the review to agree, so it is not adopted. Genre overlap explains it
only in part: of `main`'s 11 wins, `main`'s list had more genre overlap in 5,
the same in 3 and less in 3.

- **Seeds:** 20 holdout seeds, frozen in `review-seeds.json` (SHA-256
  `ca980374…e72f2`). Committed (e30b38fc) before any re-tuned list existed, and
  drawn from the seed keys alone (`random_seed` 1218). Holdout, because the
  owner saw the frozen set's Selector lists in the #1196 review and could
  recognise them.
- **Lists:** `main`'s Selector from the holdout run on `main`, and the
  re-tuned Selector from this branch, over the same retrieved pools.
  `review-pair.mjs pair` joins them as `selector-main` and `selector-retuned`.
- **Sheet:** the #1196 tooling, unchanged. A/B order is seeded random, no
  profile names or scores, and the key is in a separate file. 0 automatic ties.

```bash
node evaluations/1196/review-web.mjs --file eval-data/1218/review.json \
  --audio-base https://groovenet.home.arpa      # then open http://127.0.0.1:8196/
# afterwards
node evaluations/1196/score-review.mjs --sheet eval-data/1218/review.json \
  --key eval-data/1218/review-key.json --output eval-data/1218/review-score.json
```

Same two questions: **Which would you mix from this track?** and **Which
makes the more interesting set?** Don't open `review-key.json` or the results
while reviewing. To rebuild the sheet:

```bash
node evaluations/1218/review-pair.mjs pair \
  --before eval-data/1218-holdout-before/results.json \
  --after eval-data/1218-holdout-after/results.json \
  --output eval-data/1218/review-results.json
node evaluations/1196/side-by-side.mjs --results eval-data/1218/review-results.json \
  --output eval-data/1218/review.json --key eval-data/1218/review-key.json \
  --compare selector-main:selector-retuned --sample 20
```

### If the owner prefers `main`'s Selector

Keep the normalisation and fall back to the closest weights to `main`'s
Selector. **No weights reproduce it exactly.** `main`'s lists depended on the
raw scale's constant offset: a vibe candidate sat at ~0.99 and an
identity-only one at ~0.64, which hid identity-only candidates. Ranks have no
such offset. Configs that copy `main`'s weights with a tiny vibe weight
(`proposals/fallback-*.json`: vibe 0.006 / 0.02 / 0.05) let identity-only picks
flood the lists (53–72%), lose vibe (0.957–0.964), and reach Jaccard 0.28–0.37
with `main`. The closest of everything tried is the re-tuned family itself.
**Fallback: `proposals/selector-add-i0-g18.json`** (vibe 1 added, genre 1.8,
era 0.3, energy 0.48, BPM 0.01, no identity, no base): Jaccard 0.39 with
`main`, genre 0.66, vibe 0.977. That is `main`'s genre pull and vibe level on
the new scale. Round 1 preferred `main`, so Selector now uses it and round
2 reviews it against `main`.

## Findings

- **The identity index is genre-heavy.** On the new scale it is a genre signal
  in its own right: it is why a `max` base with strong genre fills Selector's
  lists with identity-only tracks. A profile can't currently say "identity, but
  only as a tie-break for vibe".
- **Nothing measures what the owner liked in Selector.** Genre overlap is the
  closest proxy, and the blind review decides. A "fits the seed's scene"
  metric would need labels.
- **Rank discards gaps.** A pool with one clear best match and 199 near-ties
  scores that best match only one step above the next. A rank-then-gap hybrid
  is possible later. It is a signal change, not needed for this fix.

## Reproduce

As `evaluations/1196/README.md` (stack with the `optimize` profile; rebuild
ga-service in the worktree stack after changing it). Then:

```bash
node --test evaluations/1218/*.test.mjs
just eval-profiles                                    # → eval-data/1196 (after)
node evaluations/1218/compare.mjs --before eval-data/1218-before \
  --after eval-data/1196 --spread
# a sweep entry, against main's Selector:
just eval-profiles --profiles selector \
  --config selector-add-i0-g18=evaluations/1218/proposals/selector-add-i0-g18.json
node evaluations/1218/compare.mjs --before eval-data/1218-before --after eval-data/1196 \
  --profiles selector --map selector=selector-add-i0-g18
```

The `main` baseline is the same commands on 29534d1e. Proposals from #1196
(`version` 1) still load: `configs.mjs` reads a v1 config on the new scale,
as an imported v1 file is.
