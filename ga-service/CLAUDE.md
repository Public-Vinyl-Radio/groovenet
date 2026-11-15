# ga-service

FastAPI service that reorders a set of tracks into a playlist with sensible
transitions. Pure CPU work — no database, no queue, no state.

Python 3.12+, managed with `uv`. Listens on **:8002**.

## API

|                  |                      |
| ---------------- | -------------------- |
| `GET /health`    | `{"status": "ok"}`   |
| `POST /optimize` | reorder a track list |

Note the path is `/optimize`. Request:

```json
{ "tracks": [{ "bpm": 122, "key": "8A", "embedding": "[0.01,...]" }], "mode": "genetic" }
```

Response is `{"result": [...], "mode": "..."}`, where `result` is the tracks in
their new order. At most `MAX_TRACKS` (1000) tracks per request.

`mode` is one of:

| mode              | behaviour                                               |
| ----------------- | ------------------------------------------------------- |
| `genetic`         | default; evolves an ordering over ~20 generations       |
| `greedy`          | nearest-neighbour; fast, less optimal                   |
| `cohesive_blocks` | groups by genre/vibe, favours fade-friendly transitions |

`Track` allows extra fields (`extra="allow"`), so callers can pass whole track
records. Every declared field is optional — but `genetic` needs both `bpm` and
`embedding`, and the app rejects tracks missing either _before_ calling here.

### `ranking` (#1193)

An optional `ranking` object orders by a ranking profile. ga-service knows
nothing about profiles or storage: the app resolves the library's `playlists`
profile and translates it (`toOptimizerRanking` in
`my-collection-search/src/lib/ranking/ordering.ts`, which documents the mapping).

```json
"ranking": {
  "version": 1,
  "weights": { "metadata": 0.01, "embedding": 0.12, "energy": 0.01, "bpm": 0.72,
               "key": 0.07, "same_artist": 0.2, "same_album": 0.12 },
  "constraints": { "bpm_window": { "unit": "ratio", "max": 0.06, "half_double": true },
                   "key_rule": { "metric": "wheel", "max": 1 }, "energy_range": null },
  "constraint_penalty": 1
}
```

`OrderingRanking` in `ranking.py` validates it: `extra="forbid"` at every
level, weights 0–10, finite numbers, the same constraint bounds as the app's
schema. A malformed payload is a 422 naming the field.

- **Weights** replace the constants of the one transition scorer,
  `weighted_transition_score`; every mode reads them. `same_artist` and
  `same_album` are subtracted.
- **Constraints are penalties**, because ordering can't drop a track: each
  constraint a transition A → B fails (A as the seed, as in the app's ranker;
  unknown data passes) subtracts `constraint_penalty`. The energy range is on
  ga-service's own energy (danceability and mood).
- **genetic** with a `ranking` scores with that pairwise matrix instead of its
  legacy cosine − |ΔBPM|/10, and keeps the best order as found rather than
  canonicalising it against its reverse (a profile's transitions are directional).
- **cohesive_blocks** still clusters by genre tags first; the profile orders
  within and between the blocks. On the fixture Beatmatcher's blocks come out
  as Default's.

**No `ranking` is today's behaviour, byte for byte:** `LEGACY_WEIGHTS` and no
constraints. `tests/test_pinned_orderings.py` pinned every mode's ordering and
exact transition scores before the refactor and must not be edited to follow a
change. The app sends no `ranking` for Default, so its request is unchanged too.

`metrics.py` (`bpm_jump_total`, `key_clash_count`, `vibe_distance_total`) measures
an ordering; the app's `orderingMetrics.ts` has the same functions.
`tests/fixtures/preset_orderings.json` holds the translated Beatmatcher and Selector,
their pinned orderings and metrics, and is read by tests on both sides.

## Layout

```
ga_service.py    FastAPI app, request models, mode dispatch
optimizer.py     the three algorithms plus scoring
ranking.py       the `ranking` payload, LEGACY_WEIGHTS, constraints
keys.py          key parsing, Camelot codes, wheel and camelot distances
metrics.py       BPM jumps, key clashes, vibe distance of an ordering
```

`_build_score_matrices` scores every pair once with `weighted_transition_score`
(metadata, embedding, energy, BPM and key compatibility, minus same artist and
album); greedy, cohesive_blocks and a ranked genetic run read that matrix, and
`transition_score` is one entry of it. Unranked genetic keeps its own
`score_transition` (cosine similarity − |ΔBPM|/10), summed by `score_playlist`.

`embedding` is the track's `audio_vibe` vector at the app's serving model,
looked up from `track_embeddings` by the Next.js route (#393) — callers' own
`embedding` fields are ignored. One model per request, so every vector shares a
dimension; ga-service itself is dimension-agnostic.

`embedding` arrives as a **string** (the pgvector text form) and is parsed by
`_parse_embedding`. It is not a JSON array at this boundary.

## Running and testing

```bash
uv run --group dev pytest --cov=. --cov-report=xml:coverage.xml   # as CI runs it
uv run uvicorn ga_service:app --port 8002 --reload
curl -X POST localhost:8002/optimize -H 'Content-Type: application/json' \
  -d '{"tracks":[],"mode":"greedy"}'
```

Optimisation runs in a threadpool, so it does not block the event loop. Malformed
track data surfaces as a 400 rather than a 500.
