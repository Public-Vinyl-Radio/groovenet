# fingerprint-service

Pops audio chunks off Redis, decodes them to mono PCM, asks a
`FingerprintMatcher` what they sound like, and reports the answer back through
the app's REST API. No HTTP server of its own and **no published port** —
liveness is a Redis heartbeat key that the container HEALTHCHECK reads.

Part of the automatic vinyl play tracking epic (#281). **The matcher is still a
stub**: it decodes and reports, but always answers "no match". The real
Chromaprint implementation is #278.

Python 3.12+, managed with `uv`.

## Layout

```
fingerprint_service/
  main.py          loop, dispatch, heartbeat, startup probe
  config.py        logger, redis_conn, queue/heartbeat keys, sample rate
  healthcheck.py   `python -m fingerprint_service.healthcheck` for HEALTHCHECK
  audio.py         ffmpeg decode to mono 16-bit PCM, truncation guard
  matcher.py       FingerprintMatcher protocol + StubMatcher + registry
  results.py       builds and POSTs the ingest callback
  types.py         IngestJob / MatchCandidate / IngestResult TypedDicts
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
| `run_once` | one pass of the loop |

Errors are caught at the same three levels as `download-worker`: a bad heartbeat
is logged and ignored, a bad job is logged and skipped so one payload cannot
stop the service, and a connection error backs off 5s while anything else backs
off 1s.

The split that matters is **skipped vs. reported**. A payload too malformed to
name an ingest is only logged — there is no row to report it against. Anything
that names an ingest reports a terminal state even when it fails, because the
app holds the raw file until it gets one (#276).

## Queue contract

The queue is the Redis list **`fingerprint_queue`** — deliberately not
`download_queue`, where multi-minute downloads would head-of-line block a 15
second window.

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

```bash
docker compose exec redis redis-cli LLEN fingerprint_queue
docker compose logs -f fingerprint-service
```

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

## The matcher seam

```python
class FingerprintMatcher(Protocol):
    fingerprint_type: str
    fingerprint_version: str
    def match(self, audio: NormalizedAudio) -> list[MatchCandidate]: ...
```

Nothing above `matcher.py` knows which engine is in use. #278 registers
`chromaprint` in `MATCHERS` and changes the `FINGERPRINT_MATCHER` default;
library indexing (#277) reaches the same implementation through the same
interface, so the two paths cannot drift.

`StubMatcher` takes an optional list of candidates, which is how tests and local
end-to-end runs push the populated shape through the callback.

The design #278 implements, measured in #271: raw Chromaprint fingerprint →
inverted index on the **top 28 bits** for candidates (indexing all 32 drops
recall) → exact 32-bit BER verify against the top 10 → accept **BER < 0.25**.
12 ms per window against the full 3,653-track library.

## Config

| var | default | |
| --- | --- | --- |
| `REDIS_URL` | `redis://localhost:6379` | |
| `APP_URL` | `http://app:3000` | where results are posted |
| `AUDIO_INGEST_DIR` | `/app/audio-ingest` | shared with `app` |
| `FINGERPRINT_QUEUE_KEY` | `fingerprint_queue` | |
| `FINGERPRINT_SAMPLE_RATE` | `22050` | 22050 or 44100 only |
| `FINGERPRINT_MATCHER` | `stub` | key into `MATCHERS` |
| `FINGERPRINT_BRPOP_TIMEOUT` | `5` | |
| `FINGERPRINT_HEARTBEAT_TTL` | `30` | |
| `FINGERPRINT_FFMPEG_TIMEOUT` | `60` | |

An unsupported `FINGERPRINT_SAMPLE_RATE` raises at import, so the container
fails fast instead of failing every job identically forever.

## Tests

```bash
uv run --group dev pytest                                        # 94 tests
uv run --group dev pytest --cov=fingerprint_service --cov-report=term-missing
```

Coverage is 100%. `tests/conftest.py` provides a `fake_redis` fixture
(fakeredis), an `ingest_dir` that repoints the ingest volume at `tmp_path`, and
a `wav_file` factory that writes a real WAV with the `wave` module rather than
committing a binary fixture.

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
- Ruff runs over this directory in pre-commit; config is the root `ruff.toml`.
