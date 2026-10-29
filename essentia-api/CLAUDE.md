# essentia-api

FastAPI wrapper around the Essentia audio analysis library. Stateless.

Listens on **:8001**. Called by `download-worker` after a download completes;
nothing else talks to it.

## API

|                 |                        |
| --------------- | ---------------------- |
| `GET /health`   | liveness               |
| `POST /analyze` | analyse one audio file |

The request carries a `filename` that is a **URL the service fetches**, not a
local path — Essentia has no access to the shared audio volume, so the worker
converts the track to WAV, drops it in `AUDIO_DIR` (which the app serves), and
passes the app URL.

The response carries `rhythm` (BPM, danceability), `tonal` (key) and `metadata`
(length). Callers should treat a 200 carrying `error` or `detail` as a failure —
older builds return that instead of a non-2xx status, and `track_api.py` in the
worker checks for it explicitly.

### Key detection (#524)

`tonal` carries **three independent key estimates** — `key_krumhansl`,
`key_temperley` and `key_edma` — each `{ key, scale, strength }` — plus a
fourth, differently derived one from chord detection: `chords_key`/
`chords_scale`, flat strings with no `strength`. Only `key_edma` (tuned for
electronic/dance music) is stored, as `key`; its `strength` (0–1 confidence)
is stored alongside it as `key_confidence`, and callers log a warning (never
fail) when any of the other three disagree with it — see
`extractKeyAnalysis`/`logKeyProfileDisagreement` in
`my-collection-search/src/lib/essentiaKey.ts` and the equivalent
`download-worker/worker/essentia_key.py`.

The track that prompted #524 (reported F major, tunebat/songbpm said C
major — a fourth apart, sharing 6 of 7 notes, a known confusion point for
key detection) turned out _not_ to be a disagreement between the three key
profiles: `key_edma`/`key_krumhansl`/`key_temperley` all agreed on F major
(strengths ~0.68–0.70). The actual split was against `chords_key`, which said
C major. Checking only the three profiles would have stayed silent on
exactly the track that motivated this — which is why `chords_key` is
checked too.

### BPM confidence (#531)

`rhythm.bpm` ships with a beat histogram (`bpm_histogram_first_peak_weight`,
`bpm_histogram_second_peak_weight`, and the matching `_bpm`/`_spread` fields).
Stored as `tracks.bpm_confidence`: the **margin** `first_peak_weight -
second_peak_weight` (second defaults to 0, clamped at 0). The raw first weight
is the share of beat intervals behind a tempo, so it reads low on busy tracks
even when nothing competes (0.282 vs 0.024 is a clear win); the margin is small
exactly when the tempo is contested (0.30 vs 0.28) or the histogram is diffuse.
Below 0.1 the UI flags "Uncertain BPM"; that cut-off is a heuristic, tune it
in `my-collection-search/src/lib/essentiaBpm.ts`.

`bpm_histogram_second_peak_bpm` is deliberately not stored: unlike `chords_key`
(#530) it is not an independent signal, and in the #531 example (103 vs 96) it
is a nearby tempo, not a half/double. The margin already says the estimate is
contested, and the full histogram stays in the saved analysis JSON. Revisit if
half/double-time errors turn out to matter for playlist ordering.

Existing tracks have NULL `bpm_confidence` (the UI shows nothing for NULL, never
a confident badge). `npm run backfill-bpm-confidence` fills it from the JSON
saved under `ESSENTIA_DATA_DIR`; tracks with no saved file stay NULL until
re-analysed.

### profile.yaml

`/etc/essentia/profile.yaml`, baked into the `ghcr.io/mgoltzsche/essentia` base
image, isn't visible from this repo. Its actual contents (extracted by running
`essentia_streaming_extractor_music` inside the built image):

```yaml
chromaprint:
  compute: 0
highlevel:
  compute: 1
  svm_models: [... beta5 SVM models for mood/genre/danceability ...]
lowlevel:
  frameSize: 2048
  hopSize: 1024
outputFormat: json
outputFrames: 0
```

There is no `tonal` section, so key/HPCP extraction (frame size, HPCP
bin count, profile type per key estimator) runs on
`essentia_streaming_extractor_music`'s own built-in defaults, not a tuning
choice made in this repo. Re-extract after bumping the base image to check
this hasn't changed:

```bash
docker run --rm --entrypoint cat ghcr.io/public-vinyl-radio/essentia-api:<tag> /etc/essentia/profile.yaml
```

## Gotchas

- The Docker image is large and slow to build; `just rebuild-containers` takes a
  while when it is in the list.
- Analysis is CPU-bound and single-file; there is no batching endpoint.
- The worker strips video streams (`ffmpeg -vn`) before sending, because
  embedded cover art trips up the extractor on some files.
