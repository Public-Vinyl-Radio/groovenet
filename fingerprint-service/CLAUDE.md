# fingerprint-service

Pops audio chunks off Redis, decodes them to mono PCM, asks a
`FingerprintMatcher` what they sound like, and reports the answer back through
the app's REST API. No HTTP server of its own and **no published port** —
liveness is a Redis heartbeat key that the container HEALTHCHECK reads.

It also builds the index those queries run against. **Reference-library
indexing (#277)** pops a second queue, fingerprints whole tracks from the audio
volume and persists them to `track_fingerprints` — the offline counterpart to
live ingest, through the same `FingerprintMatcher`.

Part of the automatic vinyl play tracking epic (#281). The matcher is
**Chromaprint** (#278), searched two-stage against an index held in memory.

Python 3.12+, managed with `uv`.

## Layout

```
fingerprint_service/
  main.py          loop, dispatch, heartbeat, engine identity, startup probe
  config.py        logger, redis_conn, queue/heartbeat keys, sample rate
  healthcheck.py   `python -m fingerprint_service.healthcheck` for HEALTHCHECK
  audio.py         ffmpeg decode to mono 16-bit PCM, truncation guard
  matcher.py       FingerprintMatcher protocol + Stub/Chromaprint + registry
  chromaprint_engine.py  raw 32-bit fingerprints from in-memory PCM
  reference_index.py     the two-stage search
  reference_loader.py    rebuilds the index from the app's REST API
  indexer.py       reference-library indexing: hash, decide, fingerprint
  runs.py          per-run progress counters in Redis
  results.py       POSTs the ingest callback and reference fingerprints
  types.py         Ingest*/Index*/MatchCandidate TypedDicts
```

## The loop

`main()` is deliberately thin — startup probe, build the matcher, then
`while True: run_once(matcher)`. Everything else is a named function you can
call directly in a test:

| | |
| --- | --- |
| `parse_job` | JSON → validated `IngestJob`, or `InvalidJob` |
| `resolve_ingest_path` | job path → absolute, confined to the ingest volume |
| `verify_redis` | startup probe, returns bool |
| `write_heartbeat` | liveness key; failure is logged, never fatal |
| `handle_job` | decode → match → build the result |
| `process_job` | parse one payload, run it, report the outcome |
| `publish_engine` | advertise this worker's engine and version |
| `process_index_job` | fingerprint one reference track, count the outcome |
| `run_once` | one pass of the loop, across both queues |

Errors are caught at the same three levels as `download-worker`: a bad heartbeat
is logged and ignored, a bad job is logged and skipped so one payload cannot
stop the service, and a connection error backs off 5s while anything else backs
off 1s.

The split that matters is **skipped vs. reported**. A payload too malformed to
name an ingest is only logged — there is no row to report it against. Anything
that names an ingest reports a terminal state even when it fails, because the
app holds the raw file until it gets one (#276).

## Queue contract

Two lists, popped in **one** `BRPOP fingerprint_queue fingerprint_index_queue`.
Redis returns the earliest non-empty key in argument order, so live windows win
every iteration and an index pass is preempted between reference tracks rather
than blocking for its whole duration.

### `fingerprint_queue` — live windows

Deliberately not `download_queue`, where multi-minute downloads would
head-of-line block a 15 second window.

```json
{
  "ingest_id": "uuid",
  "source_id": "living-room-vinyl",
  "session_id": "uuid-or-null",
  "sequence": 42,
  "captured_at": "2026-09-20T18:42:10Z",
  "file_path": "2026-09-20/chunk-42.wav",
  "duration_seconds": 15.02,
  "sample_rate": 44100,
  "channels": 1,
  "codec": "pcm_s16le"
}
```

`ingest_id`, `source_id` and `file_path` are required; the rest is whatever the
ingest route's ffprobe pass learned (#275). `file_path` is relative to
`AUDIO_INGEST_DIR` — absolute paths work too, but anything resolving outside the
volume is refused.

### `fingerprint_index_queue` — reference tracks (#277)

One job per track, enqueued by the app when the CLI starts a run.

```json
{
  "run_id": "uuid",
  "track_id": "1234-5",
  "friend_id": 1,
  "file_path": "Artist - Title.m4a",
  "fingerprint_type": "chromaprint",
  "fingerprint_version": "1",
  "stored_audio_sha256": "e3b0c442… or null",
  "force": false
}
```

`file_path` is `tracks.local_audio_url`, relative to `AUDIO_DIR` and confined to
it by the same rule as the ingest volume.

`stored_audio_sha256` is the load-bearing field: it is what the app already
holds for this track **under this engine and version**, so the worker can decide
skip-or-regenerate from the file in front of it without a round trip per track.
That is what makes a second run free — it queues the same jobs and every one of
them skips.

```bash
docker compose exec redis redis-cli LLEN fingerprint_queue
docker compose exec redis redis-cli LLEN fingerprint_index_queue
docker compose exec redis redis-cli HGETALL fpindex:run:<run_id>
docker compose logs -f fingerprint-service
```

## Claiming

Before doing the work, the service POSTs `{APP_URL}/api/audio/ingest/{id}/claim`
to move the ingest from `received` to `processing` (#276). That is the only
reason the state exists: without it, a chunk nothing ever collected looks
exactly like one a worker took and died on, and the app's reaper cannot tell
"restart the worker" from "the worker is crashing on this audio".

Best-effort on purpose. A failed claim is logged and the work proceeds —
refusing to process audio already in hand because the app was briefly
unreachable would be the worse trade.

## Result contract

`POST {APP_URL}/api/audio/ingest/{ingest_id}/result`, one call per chunk:

```json
{
  "ingest_id": "uuid",
  "source_id": "living-room-vinyl",
  "session_id": null,
  "sequence": 42,
  "status": "processed",
  "error": null,
  "window_start_at": "2026-09-20T18:42:10Z",
  "duration_seconds": 15.02,
  "sample_rate": 22050,
  "fingerprint_type": "stub",
  "fingerprint_version": "0",
  "candidates": []
}
```

`candidates` is a list that only ever holds zero or one entry. It stays
list-shaped so overlapping-track detection could be picked up later without a
signature change (#278) — nothing is built for that case.

**An empty `candidates` is a success, not a failure.** A no-match window is
recorded, because a gap in matches is how #279 finds the boundary between one
play and the next. `status: "failed"` means the chunk could not be processed at
all.

This goes over plain `requests` rather than `groovenet_client` because the
callback route does not exist in the OpenAPI spec yet (#276). Switch to the
generated client once it does.

## Indexing contract

`POST {APP_URL}/api/fingerprints`, one call per newly generated fingerprint:

```json
{
  "track_id": "1234-5",
  "friend_id": 1,
  "fingerprint_type": "stub",
  "fingerprint_version": "0",
  "fingerprint_data": null,
  "audio_sha256": "e3b0c442…",
  "audio_duration_seconds": 212.5
}
```

`fingerprint_data` is base64 because JSON has no bytes, and `null` when the
engine stores no payload — which is what the stub does, honestly, rather than
inventing bytes #278 could mistake for a real fingerprint. The route upserts on
(track_id, friend_id, fingerprint_type, fingerprint_version), so re-running an
index can never duplicate a row.

**Order of operations is hash, then decide, then decode.** sha256 over a 40 MB
file is milliseconds; a decode is seconds. On a re-run, where almost everything
skips, hashing first is the difference between a minute and an hour.

Progress is counted in Redis, not reported over HTTP: `runs.record_outcome`
bumps `indexed` / `skipped` / `failed` on `fpindex:run:{run_id}` and appends the
last 50 failure messages, and the app reads the hash back for the CLI. A track
that was generated but could not be persisted counts as **failed**, not indexed
— counting it as a success would store a hash the next run skips on, for a row
that does not exist.

The fourth counter, `unindexable`, is seeded by the app and never touched here.
A track with no `local_audio_url` has no file to fingerprint and never reaches
the queue — it is reported because "how much of the library can be recognised at
all" is the question the first run exists to answer.

## Engine identity

The app resolves `--missing` against a specific (`fingerprint_type`,
`fingerprint_version`), and those values live on the matcher class *here*. So
this service advertises them:

```
HSET fingerprint:engine fingerprint_type stub fingerprint_version 0
EXPIRE fingerprint:engine 30
```

Written on the heartbeat cycle with the heartbeat's TTL. A stopped worker stops
advertising, and the app answers `503 no fingerprint engine registered` rather
than indexing under a stale identity. The alternative — a copy of these values
in the app's env — is precisely how half a library ends up indexed under a
version nothing will ever query.

## Normalization

`decode_to_pcm` shells out to ffmpeg for mono signed 16-bit little-endian PCM at
22050 or 44100 Hz, on stdout. Nothing is written to disk: the ingest volume
already holds the original until the app sweeps it (#269), and a normalized copy
would be one more thing to clean up.

22050 is the default. Chromaprint resamples to 11025 internally, so a higher
rate only costs decode time.

The truncation guard is the part worth knowing about. When a job declares a
`duration_seconds`, a decode that comes back more than 10% shorter is rejected
as a partial write rather than passed on — a half-written file otherwise
produces a confident answer about the wrong few seconds.

## The matcher

Chromaprint, via `pyacoustid`'s ctypes binding — but reaching past its public
API, which returns the compressed base64 form meant for the AcoustID web
service. We need the **raw 32-bit values**: the index is built on their top
bits and verification is a bit error rate over the full 32.

Nothing is written to disk and nothing is shelled out to. `decode_to_pcm`
already put the samples in memory, and at a 12 ms/window budget a subprocess per
window would cost more than the search it feeds.

### The search, and why it is shaped this way

1. **Candidate generation** — an inverted index over the top 28 bits of each
   value (the low four are where cartridge and room noise lands), split into
   **two 14-bit halves indexed separately**. Each hit votes for a
   `(track, alignment)` pair, so stage 1 hands stage 2 the offset it needs.
2. **Verification** — exact 32-bit bit error rate against the top 10 candidates
   at the proposed alignment, and only where the window and the reference
   overlap by at least **40 values (~5 s)**.

Both of those details were measured on the #271 corpus — 41 tracks, a 3-hour
vinyl set, 736 windows, 788 held-out negative queries:

| stage 1 keying | verify overlap | recall | false positives |
| --- | --- | --- | --- |
| one 28-bit key | >= 1.0 s | 90.9% | 0 / 788 |
| two 14-bit keys | >= 1.0 s | 97.8% | 4 / 788 |
| **two 14-bit keys** | **>= 5.0 s** | **97.4%** | **0 / 788** |

**Do not "simplify" the key back to one.** It looks safe and quietly loses a
seventh of the set. At a bit error rate of 0.23 — a real match buried under a
crossfade — about 7 of 32 bits differ, so the odds all 28 top bits survive are
~0.1%: the window generates *no postings at all* and the track is never even a
candidate. That is how a track playing for three minutes went missing. Splitting
the key lets a value with one damaged half match on the other.

The overlap floor pays for it. More candidates means more chances for a few
values to line up by luck; without the floor that cost four false positives.
`tests/test_reference_index.py` pins both with a measured regression test.

### The silence gate

A query is refused before it ever reaches the search if it has too little
spectral variety — `RawFingerprint.variety`, the fraction of its values that
are distinct (#306). Chromaprint describes how the spectrum *moves*; a 15s
silent window fingerprints to one to three distinct values out of roughly a
hundred, while real music gives 98-100. Two silences are therefore not merely
similar, they are identical — a true bit error rate of 0.0 that no BER
threshold can tell apart from a real match, and raising `FINGERPRINT_MAX_BER`
only makes it worse by rejecting real matches first.

Checked on the query side, not the index side: reference tracks are full-side
rips and legitimately contain silent gaps, and refusing to *store* them
wouldn't stop a live silent window from matching one anyway.

`FINGERPRINT_MIN_VARIETY`, default **0.20** — silence measures 0.01-0.03 and
music 0.98-1.00, so the floor sits in a gap two orders of magnitude wide. Set
it to `0` to disable the check.

### The threshold

`FINGERPRINT_MAX_BER`, default **0.25**. On the corpus, true matches ran
0.02–0.25 and the lowest false candidate sat at **0.298** — a clean bimodal
split with margin on both sides, and zero false positives over 788 held-out
queries. Raising it buys recall with false plays: #279 counts a single detection
as a play, with nothing to corroborate it.

### Where the index comes from

This service holds no database connection by design, so `reference_loader`
fetches the stored blobs from `GET /api/fingerprints` in pages and rebuilds a
`ReferenceIndex`. Rebuilt at startup and every `FINGERPRINT_INDEX_REFRESH_SECONDS`,
because library indexing (#277) runs on its own schedule and a service that only
saw the tracks present at boot would silently never match anything added since.

A failed refresh keeps the index it already has, and an *empty* result never
replaces a populated index — that is far likelier to be a bad response than the
whole library being deleted.

## The matcher seam

```python
class FingerprintMatcher(Protocol):
    fingerprint_type: str
    fingerprint_version: str
    def index(self, audio: NormalizedAudio) -> bytes | None: ...
    def match(self, audio: NormalizedAudio) -> list[MatchCandidate]: ...
```

Both directions of one engine. `index` builds what `match` later searches, so
the index cannot be built by one implementation and queried by another.

Nothing above `matcher.py` knows which engine is in use. #278 registers
`chromaprint` in `MATCHERS` and changes the `FINGERPRINT_MATCHER` default;
library indexing (#277) reaches the same implementation through the same
interface, so the two paths cannot drift.

`StubMatcher` takes an optional list of candidates, which is how tests and local
end-to-end runs push the populated shape through the callback.

## Config

| var | default | |
| --- | --- | --- |
| `REDIS_URL` | `redis://localhost:6379` | |
| `APP_URL` | `http://app:3000` | where results are posted |
| `AUDIO_INGEST_DIR` | `/app/audio-ingest` | shared with `app` |
| `AUDIO_DIR` | `/app/audio` | reference library, mounted read-only |
| `FINGERPRINT_QUEUE_KEY` | `fingerprint_queue` | |
| `FINGERPRINT_INDEX_QUEUE_KEY` | `fingerprint_index_queue` | reference indexing |
| `FINGERPRINT_ENGINE_KEY` | `fingerprint:engine` | what the app reads |
| `FINGERPRINT_INDEX_RUN_PREFIX` | `fpindex:run:` | progress counters |
| `FINGERPRINT_INDEX_RUN_TTL` | `86400` | how long a run stays readable |
| `FINGERPRINT_HASH_CHUNK_SIZE` | `1048576` | streaming sha256 read size |
| `FINGERPRINT_SAMPLE_RATE` | `22050` | 22050 or 44100 only |
| `FINGERPRINT_MATCHER` | `chromaprint` | key into `MATCHERS`; `stub` matches nothing |
| `FINGERPRINT_MAX_BER` | `0.25` | above this, a candidate is discarded |
| `FINGERPRINT_MIN_VARIETY` | `0.20` | below this fraction of distinct fingerprint values, a query is refused before searching (#306); `0` disables it |
| `FINGERPRINT_VERSION` | `1` | the recipe blobs are stored under |
| `FINGERPRINT_INDEX_REFRESH_SECONDS` | `900` | how often the index is rebuilt |
| `FINGERPRINT_INDEX_PAGE_SIZE` | `500` | fingerprints per request when loading |
| `FINGERPRINT_BRPOP_TIMEOUT` | `5` | |
| `FINGERPRINT_HEARTBEAT_TTL` | `30` | |
| `FINGERPRINT_FFMPEG_TIMEOUT` | `60` | |

An unsupported `FINGERPRINT_SAMPLE_RATE` raises at import, so the container
fails fast instead of failing every job identically forever.

## Tests

```bash
uv run --group dev pytest                                        # 241 tests
uv run --group dev pytest --cov=fingerprint_service --cov-report=term-missing
```

Coverage is 100%. `tests/conftest.py` provides a `fake_redis` fixture
(fakeredis), an `ingest_dir` and an `audio_dir` that repoint the two volumes at
`tmp_path`, `wav_file` / `reference_wav` factories that write real WAVs with the
`wave` module rather than committing binary fixtures, and `job` / `index_job`
payload factories.

Two things worth knowing when adding tests:

- `run_once` blocks for `BRPOP_TIMEOUT` on an empty queue. Monkeypatch it to a
  small **positive** float — `0` means *block forever* in Redis, and the suite
  will hang rather than fail.
- The `TestAgainstRealFfmpeg` class skips itself when ffmpeg is missing.
  CI asserts ffmpeg is present so those tests cannot silently stop running.

## Gotchas

- `main.py` holds `redis_conn` and `AUDIO_INGEST_DIR` as module globals captured
  at import. Patch `fingerprint_service.main.*`, not the config module.
- The heartbeat only stays fresh because `brpop` wakes every `BRPOP_TIMEOUT`
  seconds. Lengthening that timeout without raising `HEARTBEAT_TTL` will make
  the container look unhealthy.
- The ingest volume is mounted **directly**, unlike `essentia-api`, which cannot
  see the shared audio volume and so forces `download-worker` to convert files
  and pass an HTTP URL. Don't reintroduce that here.
- `indexer.py` captures `AUDIO_DIR` at import, same as `main.py` and
  `AUDIO_INGEST_DIR`. Patch `fingerprint_service.indexer.AUDIO_DIR` in tests.
- The reference library is mounted **read-only**. Nothing here writes to it, and
  a run that touched the audio it was meant to be reading would be a bug worth
  failing loudly on.
- Both queues share one worker and one CPU. Indexing does not need a concurrency
  limit — #271 measured 1569x realtime — but it does need to yield, which is why
  it is one job per track rather than one job per run.
- Ruff runs over this directory in pre-commit; config is the root `ruff.toml`.
- **libchromaprint is a native dependency.** `pyacoustid` imports fine without
  it and only raises when asked to fingerprint, so a missing library surfaces as
  every matcher test erroring at once rather than as an import error. The image
  installs `libchromaprint1` and asserts it at build time; on macOS use
  `brew install chromaprint` and set
  `DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib` when running tests.
- **`fingerprint_version` is deliberately not libchromaprint's version.** The
  library's version changes with packaging; the fingerprint does not — 1.5.1
  (Debian, in the image) and 1.6.1 (Homebrew, on a dev Mac) emit byte-identical
  output for the same PCM. Keying on it would mean a base-image bump silently
  invalidated the whole index: the matcher would hunt for a version nothing was
  indexed under and match *nothing at all* until a full re-index finished.
  `FINGERPRINT_VERSION` names our own recipe instead (chromaprint's default
  algorithm, raw 32-bit values, little-endian); bump it when that changes.
- Synthetic test audio has to be *spectrally* distinct, not just parameterised
  differently. An earlier `tone_pcm` built every track from one formula with a
  different scalar; they fingerprinted alike and produced a false match at BER
  0.21, which looked like a matcher bug and was not.
