# download-worker

Pops jobs off Redis, downloads audio, runs it through essentia-api, and writes
the results back through the app's REST API. No HTTP server of its own —
liveness is a Redis heartbeat key that the container HEALTHCHECK reads.

Python 3.12+, managed with `uv`.

## Layout

```
worker/
  main.py            loop, dispatch, heartbeat, startup probe
  config.py          logger, redis_conn, HEARTBEAT_KEY/TTL
  healthcheck.py     `python -m worker.healthcheck` for HEALTHCHECK
  redis_utils.py     job status + log append
  subprocess_utils.py
  audio_utils.py     ffprobe wrappers, local file fetch, cleanup
  app_api.py         shared GroovenetClient / requests.Session
  track_api.py       Essentia call + writes back via groovenet_client
  types.py           JobData / JobResult TypedDicts
  jobs/
    download.py      gamdl + yt-dlp, the bulk of the logic
    analyze.py       analyse an already-local file
    cover_art.py     extract embedded art (track); the album job asks the app
                     to match it against the Discogs cover (#494)
    duration.py      fix a wrong duration
```

## The loop

`main()` is deliberately thin — startup probe, then `while True: run_once()`
with the backoff. Everything else is a named function you can call directly in a
test:

|                      |                                                     |
| -------------------- | --------------------------------------------------- |
| `normalize_job_type` | job_type as the dispatch table keys it              |
| `select_handler`     | routing: explicit type, then content-based fallback |
| `verify_redis`       | startup probe, returns bool                         |
| `write_heartbeat`    | liveness key; failure is logged, never fatal        |
| `process_job`        | parse one payload and run its handler               |
| `run_once`           | one pass of the loop                                |

Routing is a `JOB_HANDLERS` dict keyed by the aliases the queue may use (both
`fix-duration` and `fix_duration`, and so on). A job with no recognised type
that names `local_audio_url` but no remote URL is analysed in place rather than
sent to the downloader.

Errors are caught at three levels on purpose: a bad heartbeat is logged and
ignored, a bad job is logged and skipped so one payload cannot stop the worker,
and a connection error backs off 5s while anything else backs off 1s.

## Queue contract

The queue is the Redis list **`download_queue`** (underscore, not hyphen).

```bash
docker compose exec redis redis-cli LLEN download_queue
docker compose logs -f download-worker
```

## Downloading

`download.py` tries gamdl for Apple Music and yt-dlp for everything else.
yt-dlp runs a four-strategy ladder — android, iOS, web, then default extraction
— and a strategy that exits 0 without producing a file is treated as a failure
so the ladder continues.

gamdl (4.x) runs **in-process through its Python API** (`run_gamdl`:
`AppleMusicApi` → `MediaResolver.from_url` → `Downloader.download`), not as a
CLI subprocess. `gamdl rip` reports results only through a Rich UI: already
exists and not found are both "skipped" and exit 0, and paths wrap. The API
returns each track's status and path and raises typed errors, which
`describe_gamdl_error` turns into the messages the app shows (auth, not found,
region, rate limit, subscription). A track the storefront can't play is skipped
so the rest of an album still downloads; any other error stops the run. The
whole call is bounded by `GAMDL_TIMEOUT_SECONDS` (600).

gamdl needs a cookie file. `resolve_gamdl_cookie_file()` checks
`GAMDL_COOKIE_FILE` first, then two legacy paths under `/app/cookies/`.
`usable_gamdl_cookie_file()` rejects a missing, empty or non-Apple file, and the
job then fails with "Authentication failed - no usable Apple Music cookie file".

Dependencies are `gamdl[widevine]`, never `[playready]`: every HLS `aac` track
tested in #1291 decrypted through Widevine (none used the generic FairPlay key
gamdl decrypts on its own, and without pywidevine they fail with "Widevine
backend not installed"), and pyplayready pins an old `cryptography`. The
URL-mismatch guard compares the song and album IDs in the URL with what Apple's
catalog returned and logs `URL MISMATCH` to the job; it never fails the job.

Analysis is not run inline. After the file is moved and `local_audio_url` is
written, `enqueue_analyze_job` (`redis_utils.py`) pushes an `analyze-local` job
on `download_queue`, so an Essentia failure is captured and marks _that_ job
failed. The download job still completes with `analysis_status: 'queued'` and
`analysis_job_id`; if the enqueue itself fails it is sent to Sentry and the job
completes with `analysis_status: 'failed'` and `analysis_error`.

Audio quality is one of `best`, `high`, `standard`, `lossless`.
`gamdl_codec_priority` maps the first three to `aac` (HLS, 256 kbps AAC).
`lossless` becomes `alac-lossless,aac`, signed in through the wrapper, only when
`GAMDL_WRAPPER_URL` names a Wrapper v2 **1.0.0** sidecar (gamdl refuses any other
version); without one it is AAC on cookies too. A signed-out wrapper fails the
job rather than prompting. See `docs/lossless-alac.md`.

## Talking to the app

Every call to the app uses the shared `GroovenetClient` from `app_api.py`
and sends `X-Groovenet-Client: worker`, so the analytics events it causes count as pipeline work, not
as someone using the web app. When a download job ends, `report_job_outcome`
POSTs `/api/jobs/{job_id}/outcome` with no body — the app reads the outcome from
the job's Redis record, so it must be called after `update_job_status` writes the
terminal status. Best-effort: a failed report is logged, never fails the job.

## Tests

```bash
uv run --group dev pytest                     # ~370 tests
uv run --group dev pytest --cov=worker --cov-report=term-missing
```

Coverage sits at ~96%. `tests/conftest.py` provides a `fake_redis` fixture
(fakeredis) and patches `redis_conn` everywhere it is held.

Two things worth knowing when adding tests:

- `run_once` blocks for `BRPOP_TIMEOUT` on an empty queue. Monkeypatch it, or a
  two-test file costs ten seconds.
- `analyze_audio_file` writes its WAV into `AUDIO_DIR` (default `/app/audio`),
  which is env-configurable — point it at `tmp_path`.

## Gotchas

- `worker/main.py` holds `redis_conn` as a module global. Patch
  `worker.main.redis_conn`, not the config module.
- The heartbeat only stays fresh because `brpop` wakes every `BRPOP_TIMEOUT`
  seconds. Lengthening that timeout without raising `HEARTBEAT_TTL` will make
  the container look unhealthy — and it must stay under `SOCKET_TIMEOUT`, or
  the socket read times out racing the server-side block and the loop takes a
  `TimeoutError` on every idle cycle. Both live in `config.py` for that reason.
- **The root filesystem is read-only** (#1074). Write only to the volumes
  (`/app/audio`, `/app/cookies`, `/app/essentia-data`, covers), `/app/downloads`
  and `/tmp` (both disk-backed scratch volumes) and `$HOME` (a tmpfs). Anything
  else raises `Read-only file system`.
- Ruff runs over this directory in pre-commit; config is the root `ruff.toml`.
