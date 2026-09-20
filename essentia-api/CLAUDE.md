# essentia-api

FastAPI wrapper around the Essentia audio analysis library. Stateless.

Listens on **:8001**. Called by `download-worker` after a download completes;
nothing else talks to it.

## API

| | |
| --- | --- |
| `GET /health` | liveness |
| `POST /analyze` | analyse one audio file |

The request carries a `filename` that is a **URL the service fetches**, not a
local path — Essentia has no access to the shared audio volume, so the worker
converts the track to WAV, drops it in `AUDIO_DIR` (which the app serves), and
passes the app URL.

The response carries `rhythm` (BPM, danceability), `tonal` (key) and `metadata`
(length). Callers should treat a 200 carrying `error` or `detail` as a failure —
older builds return that instead of a non-2xx status, and `track_api.py` in the
worker checks for it explicitly.

## Gotchas

- The Docker image is large and slow to build; `just rebuild-containers` takes a
  while when it is in the list.
- Analysis is CPU-bound and single-file; there is no batching endpoint.
- The worker strips video streams (`ffmpeg -vn`) before sending, because
  embedded cover art trips up the extractor on some files.
