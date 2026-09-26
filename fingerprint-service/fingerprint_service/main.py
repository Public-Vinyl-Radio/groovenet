"""Queue loop: pop a chunk, decode it, ask the matcher, report the answer.

Deliberately thin, and shaped like `download-worker/worker/main.py` — a startup
probe then `while True: run_once()`, with every step a named function a test can
call directly.
"""
import json
import logging
import os
import threading
import time
import traceback
from collections.abc import Iterator
from contextlib import contextmanager

import redis

from .audio import AudioDecodeError, decode_to_pcm, level_dbfs
from .config import (
    AUDIO_INGEST_DIR,
    BRPOP_TIMEOUT,
    ENGINE_KEY,
    HEARTBEAT_INTERVAL,
    HEARTBEAT_KEY,
    HEARTBEAT_TTL,
    INDEX_QUEUE_KEY,
    INDEX_REFRESH_SECONDS,
    INDEX_RETRY_SECONDS,
    MATCHER_NAME,
    MIN_LEVEL_DBFS,
    QUEUE_KEY,
    QUEUES,
    SAMPLE_RATE,
    SET_QUEUE_KEY,
    logger,
    redis_conn,
)
from .indexer import InvalidIndexJob, index_track, outcome, parse_index_job
from .matcher import ChromaprintMatcher, FingerprintMatcher, build_matcher
from .observability import (
    STAGE_DECODE,
    STAGE_MATCH,
    STAGE_PARSE,
    STAGE_RESOLVE,
    elapsed_ms,
    log_event,
    queue_wait_ms,
)
from .reference_loader import try_build_index
from .results import (
    STATUS_FAILED,
    build_result,
    build_set_result,
    try_claim_ingest,
    try_claim_set,
    try_persist_fingerprint,
    try_record_file_stats,
    try_report_result,
    try_report_set_result,
)
from .runs import record_outcome
from .sets import InvalidSetJob, derive, parse_set_job, window_settings
from .types import IngestJob, IngestResult, SetResult

REQUIRED_FIELDS = ("ingest_id", "source_id", "file_path")


class InvalidJob(ValueError):
    """The payload is not something this service can act on."""


def parse_job(job_json: str) -> IngestJob:
    """Parse and validate one queue payload."""
    job = json.loads(job_json)
    if not isinstance(job, dict):
        raise InvalidJob(f"expected a JSON object, got {type(job).__name__}")

    missing = [field for field in REQUIRED_FIELDS if not job.get(field)]
    if missing:
        raise InvalidJob(f"missing required field(s): {', '.join(missing)}")

    return job


def resolve_ingest_path(file_path: str) -> str:
    """Absolute path to a chunk, confined to the ingest volume.

    Relative paths resolve against AUDIO_INGEST_DIR. Anything that lands outside
    it is refused: the queue is internal, but a job is still the one input this
    service takes from elsewhere, and reading an arbitrary path on the strength
    of it is not a capability worth having.
    """
    root = os.path.realpath(AUDIO_INGEST_DIR)
    candidate = os.path.realpath(os.path.join(root, file_path))
    if candidate != root and not candidate.startswith(root + os.sep):
        raise InvalidJob(f"{file_path} resolves outside {AUDIO_INGEST_DIR}")
    return candidate


def verify_redis() -> bool:
    """Ping Redis once at startup. False means the service should not start."""
    try:
        redis_conn.ping()
        logger.info("Redis connection successful")
        logger.info(
            "Queue lengths: %s",
            " ".join(f"{key}={redis_conn.llen(key)}" for key in QUEUES),
        )
        return True
    except Exception as e:
        logger.error(f"Redis connection failed: {e}")
        return False


def write_heartbeat() -> None:
    """Refresh the liveness key the container HEALTHCHECK reads.

    brpop wakes at least every BRPOP_TIMEOUT seconds, so this stays fresh while
    the loop is alive. A failure here must not take the service down.
    """
    try:
        redis_conn.set(HEARTBEAT_KEY, int(time.time()), ex=HEARTBEAT_TTL)
    except Exception as hb_err:
        logger.warning(f"Failed to write heartbeat: {hb_err}")


@contextmanager
def heartbeat_while_busy(interval: float | None = None) -> Iterator[None]:
    """Keep the heartbeat fresh from a background thread for one job.

    The loop only beats between jobs, so anything that runs longer than the
    TTL — a set recording decodes for minutes, a long reference track for tens
    of seconds — would read as a dead worker to the HEALTHCHECK while it was
    doing precisely its job. The thread does nothing but refresh the key, and
    is joined before the next job so beats can never outlive the work.
    """
    period = HEARTBEAT_INTERVAL if interval is None else interval
    stop = threading.Event()

    def beat() -> None:
        while not stop.wait(period):
            write_heartbeat()

    thread = threading.Thread(target=beat, name="heartbeat", daemon=True)
    thread.start()
    try:
        yield
    finally:
        stop.set()
        thread.join()


def publish_engine(matcher: FingerprintMatcher) -> None:
    """Advertise which engine and version this worker is running (#277).

    The app resolves `--missing` against a specific (fingerprint_type,
    fingerprint_version), and those values live on the matcher class here. This
    is how it learns them without a second copy in its own env that a bump could
    miss. Written on the heartbeat cycle and with the heartbeat's TTL, so a
    stopped worker stops advertising and the app can say "no engine registered"
    instead of indexing under a stale identity.

    Only a worker that pops the index queue advertises. The app reads this key
    to decide whether indexing can run at all, so a set-only worker vouching
    for an engine would let index jobs queue up with nothing to take them.
    """
    if INDEX_QUEUE_KEY not in QUEUES:
        return
    try:
        pipeline = redis_conn.pipeline()
        pipeline.hset(
            ENGINE_KEY,
            mapping={
                "fingerprint_type": matcher.fingerprint_type,
                "fingerprint_version": matcher.fingerprint_version,
            },
        )
        pipeline.expire(ENGINE_KEY, HEARTBEAT_TTL)
        pipeline.execute()
    except Exception as e:
        logger.warning(f"Failed to publish engine identity: {e}")


class _StageFailure(Exception):
    """A chunk failed at a named stage; carries the stage to the result."""

    def __init__(self, stage: str, error: Exception):
        super().__init__(str(error))
        self.stage = stage
        self.error = error


def handle_job(
    job: IngestJob, matcher: FingerprintMatcher, timings: dict | None = None
) -> IngestResult:
    """Decode one chunk, match it, and build the result to report.

    A decode failure is a *reported* failure, not a swallowed one: the app is
    waiting on a terminal state before it will release the file (#276).

    `timings`, when given, is filled with `decode_ms` and `match_ms` for the
    terminal log line (#280).
    """
    timings = {} if timings is None else timings
    path = resolve_ingest_path(str(job["file_path"]))
    declared = job.get("duration_seconds")

    started = time.monotonic()
    try:
        audio = decode_to_pcm(
            path,
            SAMPLE_RATE,
            declared_duration=float(declared) if declared else None,
        )
    except AudioDecodeError as e:
        timings["decode_ms"] = elapsed_ms(started)
        return build_result(job, matcher, error=str(e), error_stage=STAGE_DECODE)
    except Exception as e:
        timings["decode_ms"] = elapsed_ms(started)
        raise _StageFailure(STAGE_DECODE, e) from e
    timings["decode_ms"] = elapsed_ms(started)

    level = level_dbfs(audio.pcm)
    started = time.monotonic()
    if MIN_LEVEL_DBFS is not None and level < MIN_LEVEL_DBFS:
        # Too quiet to be music: an idle chain's hiss can resemble a quiet
        # stretch of some reference track closely enough to match it. Still
        # a processed no-match window, so gaps stay visible to #279.
        logger.info(
            "Ingest %s is %.1f dBFS, under the %.1f dBFS floor; not matching",
            job["ingest_id"],
            level,
            MIN_LEVEL_DBFS,
        )
        candidates = []
    else:
        try:
            candidates = matcher.match(audio)
        except Exception as e:
            timings["match_ms"] = elapsed_ms(started)
            raise _StageFailure(STAGE_MATCH, e) from e
    timings["match_ms"] = elapsed_ms(started)
    return build_result(
        job,
        matcher,
        candidates=candidates,
        duration_seconds=audio.duration_seconds,
        sample_rate=audio.sample_rate,
        level_dbfs=level,
    )


def _job_fields(job: dict) -> dict:
    """The identifying fields every line about one chunk carries."""
    return {
        "ingest_id": job.get("ingest_id"),
        "source_id": job.get("source_id"),
        "session_id": job.get("session_id"),
        "sequence": job.get("sequence"),
    }


def _log_terminal(job: IngestJob, result: IngestResult, timings: dict, started: float) -> None:
    """One line per chunk at its terminal state (#280)."""
    top = result["candidates"][0] if result["candidates"] else {}
    failed = result["status"] == STATUS_FAILED
    log_event(
        "ingest.failed" if failed else "ingest.processed",
        level=logging.ERROR if failed else logging.INFO,
        **_job_fields(job),
        status=result["status"],
        stage=result.get("error_stage"),
        error=result.get("error"),
        captured_at=job.get("captured_at"),
        declared_duration_seconds=job.get("duration_seconds"),
        duration_seconds=result.get("duration_seconds"),
        sample_rate=result.get("sample_rate"),
        channels=job.get("channels"),
        codec=job.get("codec"),
        level_dbfs=result.get("level_dbfs"),
        candidates=len(result["candidates"]),
        track_id=top.get("track_id"),
        friend_id=top.get("friend_id"),
        confidence=top.get("confidence"),
        offset_seconds=top.get("offset_seconds"),
        fingerprint_type=result.get("fingerprint_type"),
        fingerprint_version=result.get("fingerprint_version"),
        decode_ms=timings.get("decode_ms"),
        match_ms=timings.get("match_ms"),
        processing_ms=elapsed_ms(started),
    )


def process_job(job_json: str, matcher: FingerprintMatcher) -> IngestResult | None:
    """Run one payload end to end, reporting the outcome to the app.

    Job-level failures are logged and swallowed so one bad payload cannot stop
    the loop. A payload too malformed to name an ingest cannot be reported at
    all — there is nothing to report it against — so it is only logged.

    Every chunk that names an ingest logs exactly two structured lines here:
    `ingest.picked_up`, then `ingest.processed` or `ingest.failed` (#280).
    """
    started = time.monotonic()
    try:
        job = parse_job(job_json)
    except (json.JSONDecodeError, InvalidJob) as e:
        # The payload itself is never logged: it is the one input this service
        # takes from elsewhere.
        log_event("ingest.skipped", level=logging.ERROR, stage=STAGE_PARSE, error=str(e))
        return None

    log_event(
        "ingest.picked_up",
        **_job_fields(job),
        queue=QUEUE_KEY,
        captured_at=job.get("captured_at"),
        queue_wait_ms=queue_wait_ms(job.get("enqueued_at")),
    )

    # Announce the pickup before the work, so an ingest that kills this worker
    # is distinguishable from one nothing ever collected (#276).
    try_claim_ingest(str(job["ingest_id"]))

    timings: dict = {}
    try:
        result = handle_job(job, matcher, timings)
    except InvalidJob as e:
        # A rejection, not a crash — no traceback worth printing.
        result = build_result(job, matcher, error=str(e), error_stage=STAGE_RESOLVE)
    except _StageFailure as e:
        logger.error(traceback.format_exc())
        result = build_result(job, matcher, error=str(e.error), error_stage=e.stage)
    except Exception as e:
        logger.error(traceback.format_exc())
        result = build_result(job, matcher, error=str(e), error_stage=STAGE_MATCH)

    _log_terminal(job, result, timings, started)
    try_report_result(result)
    return result


def process_index_job(job_json: str, matcher: FingerprintMatcher) -> None:
    """Fingerprint one reference track and count the result (#277).

    Error isolation is the whole contract here: a corrupt file, an unreadable
    one, or a payload that makes no sense costs exactly that track. The run goes
    on, and the failure is counted and recorded so the final summary can name
    it.
    """
    try:
        job = parse_index_job(json.loads(job_json))
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse index job JSON: {e}")
        return
    except InvalidIndexJob as e:
        logger.error(f"Skipping malformed index job: {e}")
        return

    job.setdefault("fingerprint_type", matcher.fingerprint_type)
    job.setdefault("fingerprint_version", matcher.fingerprint_version)

    stats = None
    try:
        result, upsert, stats = index_track(job, matcher)
    except InvalidIndexJob as e:
        # A rejection, not a crash — no traceback worth printing.
        logger.error("Track %s cannot be indexed: %s", job["track_id"], e)
        result, upsert = outcome(job, "failed", error=str(e)), None
    except Exception as e:
        logger.error(f"Indexing failed for track {job['track_id']}: {e}")
        logger.error(traceback.format_exc())
        result, upsert = outcome(job, "failed", error=str(e)), None

    if stats is not None:
        # Best-effort: a lost update costs a hash next time, never the track.
        try_record_file_stats(stats)

    if upsert is not None and not try_persist_fingerprint(upsert):
        # Generated but not stored is not indexed. Counting it as a success
        # would make the next run skip a track that is not in the index.
        result = outcome(
            job,
            "failed",
            error="fingerprint could not be persisted",
            audio_sha256=result.get("audio_sha256"),
        )

    record_outcome(redis_conn, result)


_next_index_refresh = 0.0


def refresh_reference_index(matcher: FingerprintMatcher, now: float | None = None) -> None:
    """Rebuild the matcher's index from the app, if it is time.

    Library indexing (#277) runs on its own schedule, so a service that only
    ever saw the tracks present at boot would silently never match anything
    added since. A failed refresh keeps the index it already has: stale matches
    beat no matches while the app restarts.

    A failed load is retried after INDEX_RETRY_SECONDS, not a whole interval
    (#315): a worker that boots before the app would otherwise match nothing
    for fifteen minutes. The retry is scheduled *before* the attempt, so an
    exception escaping it waits out the retry too rather than hammering the app
    on every pass of the loop.
    """
    global _next_index_refresh
    if not isinstance(matcher, ChromaprintMatcher):
        return

    moment = time.time() if now is None else now
    if moment < _next_index_refresh:
        return
    _next_index_refresh = moment + INDEX_RETRY_SECONDS

    index = try_build_index(matcher.fingerprint_type, matcher.fingerprint_version)
    if index is None:
        return
    _next_index_refresh = moment + INDEX_REFRESH_SECONDS
    if len(index) == 0 and len(matcher.reference_index) > 0:
        # An empty result against a populated index is far more likely to be a
        # bad response than the whole library being deleted.
        logger.warning("Refresh returned an empty index; keeping the current one")
        return
    matcher.reference_index = index


def reset_index_clock() -> None:
    """Exported for tests: the refresh interval is module state."""
    global _next_index_refresh
    _next_index_refresh = 0.0


def process_set_job(job_json: str, matcher: FingerprintMatcher) -> SetResult | None:
    """Derive per-window matches for one set recording and report them (#282).

    Same shape as `process_job`: a payload too malformed to name a derivation
    is only logged, and anything that names one reports a terminal state, even
    on failure, because the app has a row waiting on it.
    """
    try:
        job = parse_set_job(json.loads(job_json))
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse set job JSON: {e}")
        return None
    except InvalidSetJob as e:
        logger.error(f"Skipping malformed set job: {e}")
        return None

    try_claim_set(str(job["derivation_id"]))

    try:
        result = derive(job, matcher)
    except InvalidSetJob as e:
        # A rejection, not a crash — no traceback worth printing.
        logger.error("Set %s cannot be derived: %s", job["derivation_id"], e)
        result = _failed_set(job, matcher, str(e))
    except Exception as e:
        logger.error(f"Set derivation failed: {e}")
        logger.error(traceback.format_exc())
        result = _failed_set(job, matcher, str(e))

    try_report_set_result(result)
    return result


def _failed_set(job, matcher: FingerprintMatcher, error: str) -> SetResult:
    """A failed result, echoing the job's window settings where they parse."""
    try:
        window_seconds, step_seconds = window_settings(job)
    except InvalidSetJob:
        window_seconds = step_seconds = 0.0
    return build_set_result(
        job, matcher, window_seconds=window_seconds, step_seconds=step_seconds, error=error
    )


def run_once(matcher: FingerprintMatcher) -> None:
    """One pass of the loop: heartbeat, wait for work, handle it.

    Every configured queue in one blocking pop, in priority order. Redis
    returns the earliest non-empty key in argument order, so a chunk captured
    mid-run is served before the next reference track rather than behind the
    rest of the library.
    """
    write_heartbeat()
    publish_engine(matcher)
    refresh_reference_index(matcher)

    logger.info("Waiting for jobs on %s...", ", ".join(QUEUES))
    job_data = redis_conn.brpop(list(QUEUES), timeout=BRPOP_TIMEOUT)

    if job_data:
        source_key, job_json = job_data
        # Not the payload: each handler logs what it needs, structurally.
        logger.info("Received job from %s", _key_name(source_key))
        handlers = {
            QUEUE_KEY: process_job,
            INDEX_QUEUE_KEY: process_index_job,
            SET_QUEUE_KEY: process_set_job,
        }
        with heartbeat_while_busy():
            handlers[_key_name(source_key)](job_json, matcher)


def _key_name(key: str | bytes) -> str:
    """The popped key, whether or not the client decodes responses."""
    return key.decode() if isinstance(key, bytes) else key


def main() -> None:
    logger.info("Starting fingerprint service...")
    logger.info(f"Connecting to Redis: {redis_conn.connection_pool.connection_kwargs}")

    if not verify_redis():
        return

    matcher = build_matcher(MATCHER_NAME)
    logger.info(
        "Matcher: %s (%s %s), decoding to %d Hz mono",
        MATCHER_NAME,
        matcher.fingerprint_type,
        matcher.fingerprint_version,
        SAMPLE_RATE,
    )
    publish_engine(matcher)
    refresh_reference_index(matcher)

    while True:
        try:
            run_once(matcher)
        except redis.ConnectionError as e:
            logger.error(f"Redis connection error: {e}")
            time.sleep(5)
        except KeyboardInterrupt:
            logger.info("Service stopped by user")
            break
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            logger.error(traceback.format_exc())
            time.sleep(1)


if __name__ == "__main__":
    main()
