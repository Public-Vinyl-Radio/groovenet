# #1196 — do the ranking presets do what they claim?

Phase 6 of #1190. Compares the ranking profiles on the real collection:
**Default** (today's behaviour, the baseline), **Beatmatcher** and **Selector**,
plus the internal **blend**, **mixable** and **strict** configs as reference
points. Eval only: nothing here changes the app or a preset.

## Result: Beatmatcher passes, Selector fails

| Claim                                                | Frozen set (34 + 5 seeds)                                                                                                        | Holdout (34 + 5)                                     | Decision                                |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------- |
| **Beatmatcher** beats Selector on BPM and key        | **Pass.** ±6% (½×/2×) 100% vs 53%, mean \|ΔBPM\| 1.85 vs 8.66, compatible keys 100% vs 28%; every metric 33–0 or better per seed | **Pass.** 100% vs 59%, 1.83 vs 8.53, 100% vs 34%     | Keep as is                              |
| **Selector** beats Beatmatcher on vibe and diversity | **Fail.** Vibe similarity 0.977 vs 0.980 (lost 5–25 per seed), distinct artists 9.46 vs 9.64 (3–12)                              | **Fail.** 0.979 vs 0.982 (4–26), 9.31 vs 9.62 (5–17) | Re-tune proposed below, **not applied** |
| Default (baseline)                                   | Highest vibe similarity of the presets (0.984), but 4 starved seeds, 1 empty                                                     | Same pattern (0.986; 2 starved, 1 empty)             | No claim                                |

**Why Selector fails: the vibe signal has almost no spread.** Similarity is
`1 − d/2` of the cosine distance. Within a seed's audio top 200, the vibe
similarities run 0.986 to 0.992 (p10–p90), a spread of about 0.006. Selector's
genre weight (0.3 × a 0–1 overlap) is about 50× that, and its energy weight
(0.08) still outweighs it, so Selector ranks by genre and energy, with vibe
only breaking ties. It has the highest genre overlap of any profile (0.65) and
lists that share almost nothing with Default's (Jaccard 0.03). A strong genre
pull likely also favours an artist's other releases, which would explain the
lower artist count; this eval doesn't isolate that.

### Proposed Selector re-tune (`proposals/selector-lean.json`)

Weights only, within the existing bounds: **vibe 10, identity 8, genre 0.05,
era 0.01, energy 0.01, BPM 0.01**, still no constraints. Vibe ×10 gives it a
spread of about 0.06, and genre at 0.05 becomes a pull of the same order
instead of 50× larger. Re-run with it substituted for Selector, so the same
rules apply:

|                                 | Frozen: current → proposal             | Holdout: current → proposal       |
| ------------------------------- | -------------------------------------- | --------------------------------- |
| Vibe similarity vs Beatmatcher  | 0.977 → **0.988** vs 0.980 (30–0)      | 0.979 → **0.988** vs 0.982 (30–0) |
| Distinct artists vs Beatmatcher | 9.46 → **9.72** vs 9.64 (per seed 4–8) | 9.31 → **9.74** vs 9.62 (6–7)     |
| Genre overlap                   | 0.65 → 0.37 (Beatmatcher 0.29)         | 0.71 → 0.49 (0.29)                |
| BPM ±6% ½×/2×, compatible keys  | 53%, 28% → 71%, 48%                    | 59%, 34% → 73%, 52%               |
| Overlap with Default (Jaccard)  | 0.03 → 0.25                            |                                   |
| Claims                          | Both pass                              | Both pass                         |

The vibe gain is unanimous on both sets. **The diversity gain is not.** It
wins on the mean only because Beatmatcher starves on two seeds; per seed it
has fewer distinct artists more often than more (4–8, 6–7). Beatmatcher still
wins every BPM and key metric against it.

Sweep on the frozen set (vibe similarity, genre overlap, artists; per-seed
vibe and artists against Beatmatcher):

| Config         | Weights (vibe / genre / era / energy / BPM) | Vibe  | Genre | Artists | Vibe W–L | Artists W–L |
| -------------- | ------------------------------------------- | ----- | ----- | ------- | -------- | ----------- |
| Selector today | 1 / 0.3 / 0.05 / 0.08 / 0.01                | 0.977 | 0.65  | 9.46    | 5–25     | 3–12        |
| `vibe-x10`     | 10 / 0.3 / 0.05 / 0.08 / 0.01               | 0.981 | 0.62  | 9.41    | 12–18    | 3–14        |
| `balanced`     | 10 / 0.1 / 0.02 / 0.02 / 0.01               | 0.986 | 0.49  | 9.64    | 24–6     | 4–8         |
| **`lean`**     | 10 / 0.05 / 0.01 / 0.01 / 0.01              | 0.988 | 0.37  | 9.72    | 30–0     | 4–8         |
| `pure`         | 10 / 0.02 / – / – / –                       | 0.989 | 0.27  | 9.82    | 30–0     | 4–5         |

Scaling every weight together changes nothing (only ratios matter), and vibe
at its bound of 10 alone isn't enough (`vibe-x10`). `lean` is the lightest
change that wins vibe outright while keeping more genre pull than
Beatmatcher. `pure` would lose the "genre" half of Selector's description.

**Why `profiles.ts` is unchanged:** the proposal clears the rules, but the
diversity half rests on a mean, not a per-seed win. It also changes what
Selector is: genre overlap drops by about 40%, and its lists move toward
Default's. Whether a genre-led or a vibe-led Selector makes the better set is
what the blind review asks. Applying it would update `presets.test.ts`,
`ranking.golden.test.ts` (Default only, so unaffected) and ga-service's
pinned orderings; that belongs in its own PR once the owner has judged.

### Ordering

Each playlist seed's own tracks, ordered by each profile (per transition,
mean over the 5 playlists). On the frozen set:

| Mode            | Profile             | BPM jump (raw) | ½×/2×   | Key clashes | Vibe distance |
| --------------- | ------------------- | -------------- | ------- | ----------- | ------------- |
| greedy          | Default             | 13.7           | 8.2     | 0.66        | 0.042         |
| greedy          | Beatmatcher         | 9.7            | **5.2** | **0.48**    | 0.043         |
| greedy          | Selector            | 15.7           | 12.7    | 0.75        | **0.040**     |
| greedy          | Selector (proposal) | 9.7            | 8.8     | 0.73        | **0.030**     |
| genetic         | Default             | 8.8            | 8.5     | 0.84        | 0.047         |
| genetic         | Beatmatcher         | 13.1           | **9.0** | **0.58**    | 0.048         |
| genetic         | Selector            | 17.7           | 14.6    | 0.80        | **0.044**     |
| cohesive_blocks | Beatmatcher         | 11.4           | **6.5** | **0.58**    | 0.044         |
| cohesive_blocks | Selector            | 18.4           | 15.2    | 0.81        | 0.045         |

Beatmatcher has fewer ½×/2× BPM jumps and key clashes than Selector in every
mode, on both sets. Selector has the lower vibe distance in 5 of 6 mode × set
cells; the exception is cohesive_blocks on the frozen set (0.045 vs 0.044),
where genre blocks dominate, as #1193 found. The proposal wins all 6. Raw
BPM jumps make Beatmatcher look worse than it is: in genetic mode its raw
jumps (13.1) exceed Default's (8.8), because it takes half- and double-time
transitions. Genetic is randomised (mean of 3 runs per playlist), so treat
its differences under ~1 BPM as noise.

### Other findings

- **Half/double time is what Beatmatcher's BPM wins rest on.** Its picks are
  93% within ±6% raw and 100% half/double-aware, and its mean |ΔBPM| is 6.5
  raw but 1.8 aware. It also stops starvation at slow tempos: on a 67 BPM
  seed, Default's plain ±6% window leaves nothing, and Beatmatcher finds 9.
- **Starvation:** fewer than 10 results on 4 of 39 seeds for Default (1
  empty), 2 for Beatmatcher, 6 for strict (1 empty), 0 for Selector.
  Slow (<90) and fast (155) tempos cause it; the retrieved pool is only the
  identity top 200 ∪ vibe top 200, so a tight window can't reach further.
- **Default's base is always vibe.** With `max(identity, vibe)` and the vibe
  signal near 0.99 against identity around 0.75–0.85 (both `1 − d/2`), the
  identity score never wins for a
  candidate that has a vibe score. A candidate found by the identity index
  alone (no vibe score) loses to every vibe candidate, under every profile
  with that base.
- **Beatmatcher barely uses similarity either:** 0.5 × vibe spreads about
  0.003, against up to 0.18 from tempo and 0.3 from key. It is "the best
  tempo and key match among the retrieved tracks", which is what it says, but
  the similarity weight is decorative.
- **Diversity barely separates the profiles** under one track per release:
  every profile has 9.3–9.8 distinct artists of 10, and releases sit at the
  cap. It is a weak claim to judge a preset by; uncapped lists would show
  more, but nothing in the app shows them.
- **Bug: the Camelot-metric key rule never fires on this collection.** Keys
  are stored as `C major`; the pre-scorer's `getCamelotCode` maps only
  `C Major`, so `calculateCamelotDistance` returns null and the
  `key_rule { metric: "camelot" }` constraint passes every candidate. That is
  why mixable and strict hold tempo (96%, 100% within ±6%) but not key (52%,
  45% compatible). The presets use the `wheel` metric (`camelotOf`, which
  parses both), so Default and Beatmatcher are unaffected. Not fixed here (no
  ranker changes in #1196); it needs its own issue, and fixing it moves the
  mode tests in `ranker.test.ts`.

### What carries over

- **A signal fix, not a weight fix (follow-up).** The root cause is the
  similarity signals' scale: `1 − d/2` leaves vibe with a ~0.006 spread, so
  any additive weight swamps it, and the `max` base silently prefers vibe.
  Normalising similarity within the candidate pool (rank or min–max) in the
  signal registry would let weights mean what the editor's sliders suggest.
  It changes Default's ordering (golden snapshots) and is out of scope here
  (no signal changes in #1196), so it needs its own issue. The `lean`
  proposal is the weights-only patch until then.
- **Metric summaries on shared profiles (#1195 surface, follow-up).**
  `summary.json` has per-profile aggregates (`profiles.<id>.metrics`) in the
  shape a shared profile could carry. Wiring them into the catalogue is left
  for a follow-up.
- **The harness:** `just eval-profiles --config name=file.json` scores any
  exported or draft profile against the frozen seeds without saving it. That
  is how a tuned profile can show it does what it says before it is shared.

### Blind review

Prepared, not judged: 20 seeds, 0 automatic ties. The owner fills it in (see
below). Until then the verdict rests on the metrics alone.

## Method

### Seeds (frozen before any profile ran)

`seeds.json`, **SHA-256
`a6ce1f66113a9cad070b97485534a3ad43c6c7f69becba55743ec472ac306be2`**, committed
(42f0a616) before the first profile run. `seeds.mjs` checks the hash and
refuses a changed file. The rule (`selectSeeds`, pure, `random_seed` 1196) over
friend 6's live tracks in the prod-seeded worktree database (catalogue
SHA-256 `7df088e9…6b40d7`):

- **30 complete seeds:** 6 per BPM band (`<90`, `90–105`, `105–120`,
  `120–135`, `135+`). Each band walks the top-level genres round-robin from a
  different starting genre (the 6 most common primary genres plus "other").
  A track's primary genre is the taxonomy root most of its genre links lead to.
- **4 missing-data seeds**, at random: tracks lacking BPM, key or an embedding.
  On this collection those are the same 35 tracks: no BPM, no key and only the
  identity embedding. So one stratum covers all three "missing" cases.
- **5 playlist seeds:** friend 6's playlists with 10–100 tracks that have a
  BPM and a vibe vector, at random.

`seeds-holdout.json` (SHA-256
`581c563b50eca6624218871aa870ef399d2f02a5e0e56dd000bb3ad70af474c7`) is the
same rule with `random_seed` 2196, sharing no track or playlist with the
frozen set. It was drawn after the first results, and committed (d85f6078)
before anything ran on it, to check the Selector proposal on seeds it wasn't
tuned on.

### Lists

Every profile scores the **same retrieved pool**: `POST
/api/recommendations/candidates` with `breakdown`, `scope: library`, and the
profile as `ranker` (or a whole `ranking_config` for a proposal). That is the
identity top 200 ∪ audio-vibe top 200. A playlist seed is its tracks,
retrieved by centroid and scored against the last track, as the app does.
The top 10 is taken the way the Suggestions panel takes it (`rankSuggestions`):

- seed and playlist tracks excluded;
- constraint failures dropped (the panel's toggles default on);
- best score first, ties in retrieval order;
- one track per release.

The metrics are over each top 10, then averaged over seeds. A seed counts
for a metric only where it has the data: a missing BPM or key is never a
miss. Per metric:

- **BPM:** mean |ΔBPM| and the share within ±6% of the seed, **raw** and
  **½×/2×-aware** (each pick measured at its nearest half or double tempo,
  via the app's `bpmJumpTotal`). The claims use the ½×/2× measure for both
  profiles, so Beatmatcher isn't penalised for the half and double time it
  allows; both are reported.
- **Key:** the ranker's own `key_relation` from the breakdown. Compatible is
  same, adjacent or relative; anything else is a clash.
- **Genre overlap:** the ranker's `genre_overlap` signal (taxonomy overlap,
  genre-similarity context included).
- **Vibe and identity similarity:** exact cosine (`1 − d`) of seed and pick on
  the serving embeddings, read from the worktree database. The ranker's
  signals are `1 − d/2` of the same distance, so they sit closer to 1. The retriever's own
  value is null for a candidate that came from the other index only, so it
  can't be averaged fairly.
- **Diversity:** distinct artists and distinct releases in the 10.
- **Starvation:** seeds with fewer than 10 results after constraints.
- **Overlap:** Jaccard at 10 between profiles.

**Verdict rules** (`CLAIMS` in `report.mjs`, committed in c70a4d0d before the
first full run). A claim passes only if its preset beats the other on
**every** listed metric, on the mean over the seeds where both have it.
Releases need only tie. Per-seed wins, losses and ties, with an exact sign
test, show how robust each mean is.

### Ordering

One fixed pool per playlist seed: its own tracks with a BPM and a vibe vector,
as `/api/tracks/batch` returns them to the playlist page. It is ordered by
`POST /api/playlists/genetic` with each profile as `ranking`, in every mode:
greedy, genetic (randomised, so three runs, averaged) and cohesive_blocks. The
metrics are the app's own `orderingMetrics`, per transition: BPM jump (raw and
½×/2×), key clashes and vibe distance. A proposal is stored as a temporary
profile in the worktree library for these runs and deleted afterwards.

## Blind review: Beatmatcher vs Selector (for the owner)

The metrics can't say which list is better to dig through. For 20 seeds,
sampled from the seed keys alone (`random_seed` 1196), the sheet shows the two
top 10s as lists A and B in seeded random order. Each row shows only what a
suggestion row does: title, artist, album, year, styles, BPM and key. It
never names a profile or shows a score. Which list is which is in a separate
key file. Seeds whose two lists hold the same tracks are recorded as ties and
not shown.

Two questions per seed:

1. **Which would you mix from this track?**
2. **Which makes the more interesting set?**

```bash
# 1. Build the sheet and its key (refuses to overwrite)
node evaluations/1196/side-by-side.mjs --results eval-data/1196/results.json \
  --output eval-data/1196/review.json --key eval-data/1196/review-key.json
# 2. Review in the terminal. Type mix then set, each a, b or = (no real
#    difference), then an optional note: `a b a keeps the groove`.
#    s skip, p previous, q quit. It saves after every answer, so you can stop
#    and resume. Don't open review-key.json or results.json while reviewing.
node evaluations/1196/review.mjs --file eval-data/1196/review.json
# 3. Score it (a partial sheet scores too, and says how much is unreviewed)
node evaluations/1196/score-review.mjs --sheet eval-data/1196/review.json \
  --key eval-data/1196/review-key.json
```

The tally gives, per question, Beatmatcher wins, Selector wins, no
difference, automatic ties and unreviewed items, with a sign test. The
hypothesis is that Beatmatcher wins "mix" and Selector wins "set". Showing
BPM and key makes the lists guessable. That's deliberate: a DJ deciding what
to mix reads them, and the blinding removes names and scores, not what's on
a suggestion row.

## Reproduce

Node 26+, on a worktree stack restored from the golden seed with the
`optimize` profile. Everything runs against loopback and this worktree's own
Compose project. `stack.mjs` refuses any other host. No paid calls: it reads
existing embeddings only.

```bash
node --test evaluations/1196/*.test.mjs
just worktree-services add optimize
just eval-profiles            # run.mjs then report.mjs → eval-data/1196/report.md, summary.json
# The proposal, substituted for Selector so the same claims apply:
just eval-profiles --profiles default,beatmatcher \
  --config selector=evaluations/1196/proposals/selector-lean.json
# The holdout set:
node evaluations/1196/run.mjs --out-dir eval-data/1196-holdout \
  --seeds evaluations/1196/seeds-holdout.json \
  --seeds-sha256 581c563b50eca6624218871aa870ef399d2f02a5e0e56dd000bb3ad70af474c7
node evaluations/1196/report.mjs --out-dir eval-data/1196-holdout
# Re-derive the frozen seeds from a catalogue (byte-identical to seeds.json):
node evaluations/1196/seeds.mjs --output /tmp/seeds.json --catalogue-out eval-data/1196/catalogue.json
```

`app-modules.mjs` imports the app's own TypeScript (`orderingMetrics.ts`,
`mixCompat.ts`) through Node's type stripping and a resolve hook for the `@/`
alias, so the harness measures with the app's code, not a copy. CI reruns
these tests when those modules change (`.github/scripts/ci-changes.mjs`).

## Privacy

Raw API responses (gzipped), results, vectors, the catalogue, the review
sheet and its key stay under the git-ignored `eval-data/1196*/`, at mode 0600. The committed files hold track and playlist ids, BPM bands and
top-level genre names only. This README quotes aggregates only.
