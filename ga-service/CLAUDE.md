# ga-service

FastAPI service that reorders a set of tracks into a playlist with sensible
transitions. Pure CPU work — no database, no queue, no state.

Python 3.12+, managed with `uv`. Listens on **:8002**.

## API

| | |
| --- | --- |
| `GET /health` | `{"status": "ok"}` |
| `POST /optimize` | reorder a track list |

Note the path is `/optimize`. Request:

```json
{ "tracks": [ { "bpm": 122, "key": "8A", "embedding": "[0.01,...]" } ],
  "mode": "genetic" }
```

Response is `{"result": [...], "mode": "..."}`, where `result` is the tracks in
their new order.

`mode` is one of:

| mode | behaviour |
| --- | --- |
| `genetic` | default; evolves an ordering over ~20 generations |
| `greedy` | nearest-neighbour; fast, less optimal |
| `cohesive_blocks` | groups by genre/vibe, favours fade-friendly transitions |

`Track` allows extra fields (`extra="allow"`), so callers can pass whole track
records. Every declared field is optional — but `genetic` needs both `bpm` and
`embedding`, and the app rejects tracks missing either *before* calling here.

## Layout

```
ga_service.py    FastAPI app, request models, mode dispatch
optimizer.py     the three algorithms plus scoring
```

Scoring in `optimizer.py` combines cosine similarity of embeddings with BPM
compatibility; `score_transition` is the pairwise piece and `score_playlist`
sums it over an ordering.

`embedding` arrives as a **string** (the pgvector text form) and is parsed by
`_parse_embedding`. It is not a JSON array at this boundary.

## Running and testing

```bash
uv run --group dev pytest        # 5 tests
uv run uvicorn ga_service:app --port 8002 --reload
curl -X POST localhost:8002/optimize -H 'Content-Type: application/json' \
  -d '{"tracks":[],"mode":"greedy"}'
```

Optimisation runs in a threadpool, so it does not block the event loop. Malformed
track data surfaces as a 400 rather than a 500.
