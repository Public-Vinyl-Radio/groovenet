# #1273 — local embeddings without an OpenAI key

The local default ships independently of these informational metrics. No ranking
weights or text templates were tuned for this evaluation.

## Method

- Restored the existing `20261115T200718Z` golden seed into this previously empty
  worktree database: 16,194 tracks. Migrated through the worktree app container.
- Ran the #1196 harness on the serving OpenAI vectors, then generated local q8
  vectors for the **same serving identity/audio_vibe texts and template versions**
  (20,523 texts). Kept OpenAI vectors alongside them. Used BGE CLS pooling and
  normalized 384-dimensional vectors, with the pinned revision in `localModel.ts`.
- Trained the local partial IVF indexes after the bulk load and used the existing
  target/serving PATCH flow to cut this worktree over to local embeddings.
- Repeated the unmodified #1196 harness: 34 track + 5 playlist seeds, all six
  profiles, greedy/genetic/cohesive_blocks ordering, three genetic runs per
  playlist/profile. Frozen seed SHA-256:
  `a6ce1f66113a9cad070b97485534a3ad43c6c7f69becba55743ec472ac306be2`.
- `eval-data/1273/{openai,local}` holds private raw responses, vectors and reports
  locally. The committed aggregate contains no track titles or library metadata.
  Requests used `Connection: close` on the local run to avoid a stale keep-alive
  socket after the harness's synchronous SQL phase under Node 26.

```sh
node evaluations/1196/run.mjs --out-dir eval-data/1273/openai
node evaluations/1196/report.mjs --out-dir eval-data/1273/openai
# Generate local vectors, train the indexes, then PATCH target and serving.
node evaluations/1196/run.mjs --out-dir eval-data/1273/local
node evaluations/1196/report.mjs --out-dir eval-data/1273/local
```

Cosine similarities are within each model's own vector space; their absolute
scales are **not comparable quality scores**. The harness measures tempo/key,
genre overlap and diversity, not human relevance judgments. Genetic ordering is
randomized; small differences should be treated as noise.

## Image and runtime cost

The Transformers.js image helper uses the app's fixed `sharp ^0.35.5` through a
scoped override, avoiding a vulnerable duplicate copy. Embedding inference still
uses the same pinned q8 weights and ONNX runtime.

Two amd64 `runner` images were built from HEAD and this change. OrbStack's lazy
images were both materialized before measuring. The baseline and final image measured
1,371,313,438 → 1,493,620,402 bytes uncompressed: **+122,306,964 bytes
(+116.64 MiB, +8.92%)**. Baked q8 weights/tokenizer occupy about 34.7 MB.

On this ARM Mac under amd64 emulation, an offline isolated provider benchmark
used a shared CPU session, two intra-op threads, one inter-op thread and batches
of eight. Cold first inference took 1.39 s. A warm batch of 64 short identity-like
texts took 1.51 s (**42.4 texts/s**); RSS rose from 103 to **311 MiB**. The larger
seed pass processed 20,523 actual stored texts in 206 s (~100 texts/s), peaking
at 728 MiB RSS including its eager input rows and database client. These are
rough measurements under concurrent build/test load, not native amd64 capacity
claims. Production queue batches do not load the entire evaluation corpus.

The actual standalone production image also returned a normalized 384-dimensional
vector with `--network none --read-only`; no writable model cache or first-run
download was available.

## Ranking metrics

Per-seed means, top 10 picks. Starved means fewer than 10 results; the second
number is empty seeds. Tempo metrics allow half/double time. Full aggregates
are in [metrics.json](metrics.json).

| Profile     | Model  | Starved/empty | Mean ΔBPM | Within ±6% | Compatible key | Genre | Vibe cosine | Identity cosine | Artists |
| ----------- | ------ | ------------- | --------- | ---------- | -------------- | ----- | ----------- | --------------- | ------- |
| default     | openai | 4/1           | 2.54      | 100.0%     | 100.0%         | 0.252 | 0.9838      | 0.5197          | 9.15    |
| default     | local  | 4/1           | 2.48      | 100.0%     | 100.0%         | 0.245 | 0.9907      | 0.7777          | 9.08    |
| beatmatcher | openai | 2/0           | 2.76      | 100.0%     | 100.0%         | 0.462 | 0.9731      | 0.5647          | 9.56    |
| beatmatcher | local  | 4/0           | 2.68      | 100.0%     | 100.0%         | 0.490 | 0.9861      | 0.7979          | 9.18    |
| selector    | openai | 0/0           | 8.22      | 59.4%      | 33.7%          | 0.656 | 0.9771      | 0.5857          | 9.51    |
| selector    | local  | 0/0           | 9.30      | 53.1%      | 42.0%          | 0.681 | 0.9871      | 0.8131          | 9.26    |
| blend       | openai | 0/0           | 4.12      | 71.7%      | 51.2%          | 0.376 | 0.9818      | 0.5661          | 9.59    |
| blend       | local  | 0/0           | 4.18      | 72.3%      | 54.0%          | 0.372 | 0.9893      | 0.7989          | 9.69    |
| mixable     | openai | 2/1           | 2.33      | 94.7%      | 74.6%          | 0.292 | 0.9830      | 0.5334          | 9.31    |
| mixable     | local  | 3/1           | 2.30      | 95.8%      | 75.4%          | 0.282 | 0.9903      | 0.7843          | 9.31    |
| strict      | openai | 17/3          | 1.77      | 100.0%     | 100.0%         | 0.474 | 0.9772      | 0.5543          | 7.31    |
| strict      | local  | 15/3          | 1.73      | 100.0%     | 100.0%         | 0.465 | 0.9881      | 0.7954          | 7.79    |

Local retains the expected tempo/key constraints. Default has the same
starvation count. Beatmatcher has two additional starved seeds; Selector
remains full and has higher genre overlap but fewer distinct artists. These
figures do not establish a human relevance or quality advantage for either
model. No preset or template changes were made.

## Playlist ordering

Each cell is OpenAI → local, averaged over the same five playlists. Genetic
results average three runs per playlist/profile. Vibe distance is within-model.

| Mode            | Profile     | Mean ΔBPM (½×/2×) | Key clash rate | Vibe distance   |
| --------------- | ----------- | ----------------- | -------------- | --------------- |
| greedy          | default     | 8.24 → 8.44       | 0.657 → 0.652  | 0.0418 → 0.0233 |
| greedy          | beatmatcher | 5.34 → 5.32       | 0.481 → 0.477  | 0.0406 → 0.0217 |
| greedy          | selector    | 11.77 → 10.21     | 0.728 → 0.754  | 0.0336 → 0.0183 |
| genetic         | default     | 8.37 → 8.31       | 0.821 → 0.810  | 0.0461 → 0.0249 |
| genetic         | beatmatcher | 9.46 → 9.57       | 0.576 → 0.581  | 0.0474 → 0.0249 |
| genetic         | selector    | 14.17 → 13.27     | 0.775 → 0.788  | 0.0397 → 0.0213 |
| cohesive_blocks | default     | 10.09 → 10.57     | 0.682 → 0.691  | 0.0446 → 0.0250 |
| cohesive_blocks | beatmatcher | 7.21 → 7.12       | 0.562 → 0.550  | 0.0434 → 0.0227 |
| cohesive_blocks | selector    | 13.11 → 13.01     | 0.757 → 0.764  | 0.0378 → 0.0198 |
