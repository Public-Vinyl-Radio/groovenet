# #1170 — file genre and local-model lyric summaries in embedding text

Does the audio file's own genre, or a short summary of a track's lyrics,
improve the `identity` (similar tracks) or `context` (natural-language
retrieval) embedding? Eval only; nothing here changes the app.

Reuses the #379/#382 harness and rules: the frozen 24 queries
(`evaluations/379/queries.json`), `text-embedding-3-small`, exact cosine
search, pooled and blinded judgments, and unjudged hits are **never** counted
as irrelevant.

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

## Reproduce

Node 26+. `S` is the private #379/#382 data directory. Pass every earlier
review sheet there (#379's, and #382's small- and large-model sheets) as a
`--prior` / `--review`; the lines below show two.

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
  --prior $S/379-review.json --prior $S/382-review.json \
  --output eval-data/1170-review.json
node evaluations/379/review.mjs --file eval-data/1170-review.json
node evaluations/1170/score-judgments.mjs --review $S/379-review.json --review $S/382-review.json \
  --review eval-data/1170-review.json \
  --scores eval-data/1170-scores.json --output eval-data/1170-precision.json
```

Prior judgments are keyed by `(query, friend, track)`, so they carry over to
the new snapshot; only pooled pairs nobody has judged go into the new sheet.
Precision is reported as lower–upper bounds until every pooled hit is judged,
and per-query comparisons against `I0`/`C0` use a seeded 95% bootstrap.

## Status

- [x] Exporter: `embeddings export-eval` carries `audio_file_genre`, and
      `--lyrics` adds owner-only lyrics. It fails if no track returns lyrics,
      because a server without the route reads as "no lyrics" for every track.
- [x] Summariser, variant builders, scoring and review tools, with tests.
- [x] Snapshot: exported 2026-11-11 from `sha-6a68c4b` (which includes
      #1176), friend 6. SHA-256
      `d0ffee14ff56345807884e838187259871d2e4b6fd973791625e0b6ea6f5d1a0`.
- [x] Local model: `qwen3.5:9b-q4_K_M` installed and smoke-tested.
- [ ] Summaries, quality review, retrieval results, go / no-go.
