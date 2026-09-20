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
  track_api.py       Essentia call + writes back via groovenet_client
  types.py           JobData / JobResult TypedDicts
  jobs/
    download.py      gamdl + yt-dlp, the bulk of the logic
    analyze.py       analyse an already-local file
    cover_art.py     extract embedded art (track and album)
    duration.py      fix a wrong duration
```

## The loop

`main()` is deliberately thin — startup probe, then `while True: run_once()`
with the backoff. Everything else is a named function you can call directly in a
test:

| | |
| --- | --- |
| `normalize_job_type` | job_type as the dispatch table keys it |
| `select_handler` | routing: explicit type, then content-based fallback |
| `verify_redis` | startup probe, returns bool |
| `write_heartbeat` | liveness key; failure is logged, never fatal |
| `process_job` | parse one payload and run its handler |
| `run_once` | one pass of the loop |

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

gamdl needs a cookie file. `resolve_gamdl_cookie_file()` checks
`GAMDL_COOKIE_FILE` first, then two legacy paths under `/app/cookies/`. A file
with no Apple entries is skipped with a warning rather than passed through.

Audio quality is one of `best`, `high`, `standard`, `lossless`.

## Tests

```bash
uv run --group dev pytest                     # 275 tests
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
  the container look unhealthy.
- Ruff runs over this directory in pre-commit; config is the root `ruff.toml`.
