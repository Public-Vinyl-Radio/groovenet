# #1170 — file genre and local-model lyric summaries in embedding text

Does the audio file's own genre, or a short summary of a track's lyrics,
improve the `identity` (similar tracks) or `context` (natural-language
retrieval) embedding? Eval only; nothing here changes the app.

Reuses the #379/#382 harness and rules: the frozen 24 queries
(`evaluations/379/queries.json`), `text-embedding-3-small`, exact cosine
search, pooled and blinded judgments, and unjudged hits are **never** counted
as irrelevant.

## Result: no-go for both

| Variant             | Decision  | Why                                                                                     |
| ------------------- | --------- | --------------------------------------------------------------------------------------- |
| `IL` lyric line     | **No-go** | Lost the blind side-by-side 2–6 (1–5 on seeds whose text it changes); hours to backfill |
| `IG` file genre     | **No-go** | Lost 2–4; changes at most a couple of suggestions per seed                              |
| `IGL` both          | No-go     | Not judged; neither part helped                                                         |
| `CG` / `CL` / `CGL` | Not taken | Text search is rarely used on a 4,000-track collection; partial judgments only (below)  |

Neither variant showed any benefit, and every judged signal leaned against
them. The side-by-side was stopped early, so the counts are an incomplete
sample, not a significant loss. What carries over: the `export-eval --lyrics`
option and the summariser, if lyrics ever become a filter ("spanish vocals",
"instrumental") rather than embedding text.

### How the owner uses suggestions, and what that changed

The plan was #379's frozen text queries. Partway through judging, the owner
pointed out that they rarely search; they start from a track and follow its
suggestions. So the decision moved to the identity embedding, judged the way
it is used.

**Playlist proxy** (200 playlist seeds, half with a summary): flat. Every
variant is within about 0.01 MRR of its baseline, and recall@10 is under 0.02
everywhere, too low to separate anything.

| Run   | MRR all | MRR, seed has summary | MRR, other releases, seed has summary |
| ----- | ------- | --------------------- | ------------------------------------- |
| `I0`  | 0.076   | 0.051                 | 0.079                                 |
| `IG`  | 0.079   | 0.054                 | 0.093                                 |
| `IL`  | 0.076   | 0.047                 | 0.095                                 |
| `IGL` | 0.076   | 0.049                 | 0.094                                 |
| `C0`  | 0.065   | 0.038                 | 0.088                                 |
| `CG`  | 0.064   | 0.039                 | 0.091                                 |
| `CL`  | 0.068   | 0.047                 | 0.083                                 |
| `CGL` | 0.070   | 0.051                 | 0.091                                 |

**How much the suggestions move** (40 playlist seeds, mean tracks shared
with `I0`'s list):

| List                       | `IG`        | `IL`        | `IGL`       |
| -------------------------- | ----------- | ----------- | ----------- |
| Raw top 10                 | 9.6 (26/40) | 9.2 (21/40) | 9.1 (16/40) |
| Top 10 from other releases | 9.3 (19/40) | 8.5 (10/40) | 8.6 (10/40) |
| Top 10 from other artists  | 8.9 (12/40) | 8.0 (9/40)  | 7.9 (6/40)  |

In brackets, seeds whose list is unchanged. About 7 of the raw top 10 are the
seed's album mates, which share every metadata line and so never move; the
app already folds them to one per release (`rankSuggestions`, #1029).

**Blind side-by-side** (`side-by-side.mjs`): per seed, the top 10 under one
track per release, as Related tracks and the Suggestions panel show it, for
the variant and for `I0`, as lists A and B in seeded random order. The owner
picked the list they would rather dig through.

| Comparison   | Variant better | `I0` better | No difference | Identical lists | Not judged |
| ------------ | -------------- | ----------- | ------------- | --------------- | ---------- |
| `IL` vs `I0` | 2              | 6           | 3             | 8               | 21         |
| `IG` vs `I0` | 2              | 4           | 2             | 10              | 22         |

Sign test, ties dropped: p = 0.29 (`IL`) and 0.69 (`IG`). On seeds with a
summary, where the lyric line changes the text, `IL` went 1–5 with 3 no
difference. A first sheet without the per-release cap was abandoned after 9
items, because album mates filled both lists.

**Text queries** (partial, not used for the decision): 223 of the 505 pooled
pairs judged, so precision is still a wide range. Paired worst-to-best change
in precision@10 against the baseline, with hits both top 10s share cancelled:

| Comparison    | Change           | Deciding pairs judged |
| ------------- | ---------------- | --------------------- |
| `IG` vs `I0`  | −0.067 to +0.058 | 28 of 58              |
| `IL` vs `I0`  | −0.092 to +0.058 | 32 of 68              |
| `IGL` vs `I0` | −0.108 to +0.079 | 39 of 84              |
| `CG` vs `C0`  | −0.096 to +0.096 | 12 of 58              |
| `CL` vs `C0`  | −0.142 to +0.138 | 39 of 106             |
| `CGL` vs `C0` | −0.179 to +0.171 | 46 of 130             |

The #379/#382 judgments could not be found, so nothing carried over. The
owner also found the 24 queries unlike what they would type, and none of them
asks about lyrics, which limits what they could show for `L` variants anyway.

### Summary quality

40 summaries reviewed against their lyrics by the owner, stratified 7/7/6
per vocal presence × English/other:

| Stratum               | Faithful | Minor | Hallucinated | Unreviewed |
| --------------------- | -------- | ----- | ------------ | ---------- |
| full lyrics / english | 7        | 0     | 0            | 0          |
| full lyrics / other   | 5        | 0     | 0            | 2          |
| hook-only / english   | 7        | 0     | 0            | 0          |
| hook-only / other     | 6        | 0     | 1            | 0          |
| sparse / english      | 6        | 0     | 0            | 0          |
| sparse / other        | 6        | 0     | 0            | 0          |

The one flag is a language call on a hook-only track with almost no text
("not sure it's Portuguese"), not an invented theme. The summaries were fine;
they just didn't make suggestions better.

### Cost

Local summaries: 2 h 9 min on an M4 Pro GPU for 2,399 lyric texts, about 2×
that CPU-only, more on the homelab. Embeddings: 20,830 texts, 1.49M tokens,
≈ $0.03, plus 202 tokens for the queries.

## Privacy

- Raw lyrics go **only** to a local Ollama model. `summarize.mjs` refuses any
  host that is not a loopback address.
- Only the summary reaches embedding text, and so OpenAI. Tests check that no
  lyric text appears in any variant.
- The snapshot (with lyrics), summaries, texts, vectors, rankings and review
  sheets stay under the git-ignored `eval-data/`, at mode 0600. This file
  holds aggregates only.

## Variants

| Run   | Text                                                                                |
| ----- | ----------------------------------------------------------------------------------- |
| `I0`  | Current identity text (`buildIdentityText`), composer populated since #1169         |
| `IG`  | `I0` + `File genre: …` line                                                         |
| `IL`  | `I0` + `Lyrics: <themes>; mood …; language …; vocals …` line                        |
| `IGL` | both lines                                                                          |
| `C0`  | Current context text (`buildContextText`, #382's F)                                 |
| `CG`  | file genres join the broad genres: `… latin, musica tropical music from the 1970s.` |
| `CL`  | `C0` + `Lyrics about <themes>; <mood> mood; sung in <languages>; <vocal presence>.` |
| `CGL` | both                                                                                |

File genres are normalised like Discogs genres, capped at 4, and dropped when
the release already has that value as a genre or style. A track with no
lyrics, or whose summary failed validation, gets no lyric line, so its L text
equals its baseline. Every proxy and precision number is therefore also
reported split by whether the seed or hit has a summary.

`variants.mjs` mirrors the app builders; its tests check the identity mirror
against #379's builder and pin the context text to `buildContextText`'s shape.

## Summary prompt

`summary.mjs`, `PROMPT_VERSION = 1`. Only the lyrics are sent: no title,
artist or album, so the model can't fill in a summary from what it remembers
about a well-known song. Lyrics are cut at 6,000 characters (cut tracks are counted).
Ollama `/api/chat` with `think: false`, `temperature: 0`, `seed: 0`,
`num_ctx: 8192`, and the JSON schema as `format`, so decoding is constrained:

- `themes`: 0–4 phrases of 1–4 words (empty for hook-only or no theme)
- `mood`: 1–3 words
- `languages`: 1–3 lowercase English names
- `vocal_presence`: `hook-only` | `sparse` | `full lyrics`

Output that breaks the shape is dropped (no lyric line), never repaired. The
cache key is prompt version + model digest + lyrics, so a prompt or model
change re-summarises.

Model: `qwen3.5:9b-q4_K_M` (GGUF, Q4_K_M, 9.0B, llama.cpp runner), digest
`56671c2ab9385f9cfcb404638e32cd62d88e3501d44822208363c010179a3c90`, on
Ollama 0.40.16. The run also records the prompt SHA-256 and options in
`eval-data/1170-summaries/manifest.json`; copy them here with the results.

Why not `qwen3.5:latest`: since Ollama 0.40 that tag is the Apple-only MLX
build (`nvfp4`), which rejects schema-constrained output ("structured output
is unavailable") and cannot run on the amd64 homelab. The GGUF build is the
one a homelab service would run, so its outputs and CPU timings carry over.

Smoke test on three synthetic lyrics (hook-only, Spanish, English protest),
M4 Pro, warm model: about 2 s per track on the GPU and about 4 s CPU-only
(`num_gpu: 0`). Repeats gave identical output on one backend, but
**CPU and GPU outputs differ slightly** (one theme and one mood word on one
sample). A shipped design must pin summaries to the host and backend that
made them, or accept that a re-summarise elsewhere changes source hashes.

## Snapshot

| Field                   | Tracks (of 4,063)        |
| ----------------------- | ------------------------ |
| composer                | 3,551 (87%)              |
| `audio_file_genre`      | 3,809 (94%)              |
| lyrics                  | 2,444 (60%)              |
| distinct lyric texts    | 2,399                    |
| lyrics over 6,000 chars | 2 (cut before prompting) |

414 albums, 35 playlists. Lyrics are a median of 1,014 characters (p90
1,914). This is a new snapshot, so its numbers are not directly comparable to
#379/#382's; `I0` and `C0` are re-measured here as the baselines.

## Summary run

`qwen3.5:9b-q4_K_M`, digest `56671c2a…a3c90`, prompt version 1, prompt
SHA-256 `168eb944b0f513ef75e70ec733425e984354a99b9c66d25108764092e06b6a1c`,
options `temperature 0, seed 0, num_ctx 8192, think false`. M4 Pro, Metal.

| Measure                         | Value                                                           |
| ------------------------------- | --------------------------------------------------------------- |
| Distinct lyric texts summarised | 2,399                                                           |
| Failed validation               | 8 (0.3%), all a theme longer than 4 words                       |
| Truncated at 6,000 chars        | 2                                                               |
| Time per track                  | mean 3.24 s, median 3.09 s, p90 4.12 s                          |
| Total                           | 2 h 9 min (7,767 s), ≈ 22 output tokens/s                       |
| Vocal presence                  | full 2,248 · hook-only 106 · sparse 37                          |
| Languages                       | english 1,357 · spanish 879 · mixed 74+ · portuguese 40 · other |
| No themes                       | 10                                                              |

The homelab is amd64 CPU only; the CPU-only smoke test here was about 2× the
GPU time, and a homelab CPU will be slower still, so budget several hours for
a full backfill there. Language lists keep the model's order
(`spanish, english` and `english, spanish` both occur).

The quality sample deliberately oversamples hook-only and sparse tracks (7/7/6
per vocal-presence × English/other stratum), so report counts per stratum, not
one rate for the whole sample.

## Reproduce

Node 26+. Earlier #379/#382 review sheets, where you still have them, go in
as `--prior` (make-review) and `--review` (score-judgments); this run had none.

```bash
node --test evaluations/1170/*.test.mjs
just build-packages
# 1. Snapshot, with lyrics (needs #1176 deployed)
node packages/groovenet-cli/build/bin/groovenet.js embeddings export-eval \
  --friend-id 6 --lyrics --output eval-data/1170-friend-6.json --json
shasum -a 256 eval-data/1170-friend-6.json
# 2. Local summaries (resumable; --limit N for a timing sample, --cpu to time CPU-only)
node evaluations/1170/summarize.mjs --snapshot eval-data/1170-friend-6.json \
  --output-dir eval-data/1170-summaries
# 3. Summary quality: sample, review by hand, tally
node evaluations/1170/quality-sample.mjs --snapshot eval-data/1170-friend-6.json \
  --summaries eval-data/1170-summaries --output eval-data/1170-quality.json
node evaluations/1170/review-summaries.mjs --file eval-data/1170-quality.json
node evaluations/1170/quality-sample.mjs --tally eval-data/1170-quality.json
# 4. Texts, embeddings (dry run first, then --execute), query vectors
node evaluations/1170/prepare.mjs --snapshot eval-data/1170-friend-6.json \
  --summaries eval-data/1170-summaries --output eval-data/1170-texts.json
op run --env-file=.env.tpl -- node evaluations/382/embed.mjs --texts eval-data/1170-texts.json \
  --output-dir eval-data/1170-small --variants I0,IG,IL,IGL,C0,CG,CL,CGL --execute
op run --env-file=.env.tpl -- node evaluations/382/embed.mjs --queries evaluations/379/queries.json \
  --output eval-data/1170-query-vectors.json
# 5. Rankings, blinded review of new pooled pairs, precision
node evaluations/1170/score.mjs --snapshot eval-data/1170-friend-6.json --texts eval-data/1170-texts.json \
  --output eval-data/1170-scores.json \
  --run I0:I0:eval-data/1170-small:eval-data/1170-query-vectors.json   # …one --run per variant
node evaluations/382/make-review.mjs --snapshot eval-data/1170-friend-6.json --scores eval-data/1170-scores.json \
  --output eval-data/1170-review.json        # add --prior $S/... for any earlier sheets you have
node evaluations/379/review.mjs --file eval-data/1170-review.json
node evaluations/1170/score-judgments.mjs --review eval-data/1170-review.json \
  --scores eval-data/1170-scores.json --output eval-data/1170-precision.json
# 6. Blind side-by-side of similar-track lists (the decision), then the tally
node evaluations/1170/side-by-side.mjs --snapshot eval-data/1170-friend-6.json --texts eval-data/1170-texts.json \
  --vectors eval-data/1170-small --compare IL:I0 --compare IG:I0 --variety-cap 1 \
  --output eval-data/1170-side-by-side.json --key eval-data/1170-side-by-side-key.json
node evaluations/1170/review-side-by-side.mjs --file eval-data/1170-side-by-side.json
node evaluations/1170/side-by-side.mjs --tally eval-data/1170-side-by-side.json \
  --key eval-data/1170-side-by-side-key.json
```

The judge never opens the key file or `1170-scores.json`; both say which
list or ranking came from which variant.

Prior judgments are keyed by `(query, friend, track)`, so they carry over to
the new snapshot; only pooled pairs nobody has judged go into the new sheet.
Precision is reported as lower–upper bounds until every pooled hit is judged.
Comparisons against `I0`/`C0` report a worst-to-best delta, and add a seeded
95% bootstrap only once the sheet is complete: a bootstrap over lower bounds
would count unjudged hits as misses.

## Status

- [x] Exporter: `embeddings export-eval` carries `audio_file_genre`, and
      `--lyrics` adds owner-only lyrics. It fails if no track returns lyrics,
      because a server without the route reads as "no lyrics" for every track.
- [x] Summariser, variant builders, scoring and review tools, with tests.
- [x] Snapshot: exported 2026-11-11 from `sha-6a68c4b` (which includes
      #1176), friend 6. SHA-256
      `d0ffee14ff56345807884e838187259871d2e4b6fd973791625e0b6ea6f5d1a0`.
- [x] Local model: `qwen3.5:9b-q4_K_M` installed and smoke-tested.
- [x] Summaries (see above).
- [x] Summary quality review: 37 faithful, 1 flagged, 2 unreviewed.
- [x] Retrieval results, go / no-go: no-go for both (see the top).
