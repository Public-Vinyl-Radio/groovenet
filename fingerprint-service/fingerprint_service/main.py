"""Queue loop: pop a chunk, decode it, ask the matcher, report the answer.

Deliberately thin, and shaped like `download-worker/worker/main.py` — a startup
probe then `while True: run_once()`, with every step a named function a test can
call directly.
"""
import json
import os
import time
import traceback

import redis

from .audio import AudioDecodeError, decode_to_pcm
from .config import (
    AUDIO_INGEST_DIR,
    BRPOP_TIMEOUT,
    HEARTBEAT_KEY,
    HEARTBEAT_TTL,
    MATCHER_NAME,
    QUEUE_KEY,
    SAMPLE_RATE,
    logger,
    redis_conn,
)
from .matcher import FingerprintMatcher, build_matcher
from .results import build_result, try_report_result
from .types import IngestJob, IngestResult

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
        logger.info("Current queue length: %s", redis_conn.llen(QUEUE_KEY))
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


def handle_job(job: IngestJob, matcher: FingerprintMatcher) -> IngestResult:
    """Decode one chunk, match it, and build the result to report.

    A decode failure is a *reported* failure, not a swallowed one: the app is
    waiting on a terminal state before it will release the file (#276).
    """
    path = resolve_ingest_path(str(job["file_path"]))
    declared = job.get("duration_seconds")

    try:
        audio = decode_to_pcm(
            path,
            SAMPLE_RATE,
            declared_duration=float(declared) if declared else None,
        )
    except AudioDecodeError as e:
        logger.error("Ingest %s could not be decoded: %s", job["ingest_id"], e)
        return build_result(job, matcher, error=str(e))

    candidates = matcher.match(audio)
    return build_result(
        job,
        matcher,
        candidates=candidates,
        duration_seconds=audio.duration_seconds,
        sample_rate=audio.sample_rate,
    )


def process_job(job_json: str, matcher: FingerprintMatcher) -> IngestResult | None:
    """Run one payload end to end, reporting the outcome to the app.

    Job-level failures are logged and swallowed so one bad payload cannot stop
    the loop. A payload too malformed to name an ingest cannot be reported at
    all — there is nothing to report it against — so it is only logged.
    """
    try:
        job = parse_job(job_json)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse job JSON: {e}")
        return None
    except InvalidJob as e:
        logger.error(f"Skipping malformed job: {e}")
        return None

    try:
        result = handle_job(job, matcher)
    except InvalidJob as e:
        # A rejection, not a crash — no traceback worth printing.
        logger.error("Ingest %s cannot be processed: %s", job["ingest_id"], e)
        result = build_result(job, matcher, error=str(e))
    except Exception as e:
        logger.error(f"Job processing failed: {e}")
        logger.error(traceback.format_exc())
        result = build_result(job, matcher, error=str(e))

    try_report_result(result)
    return result


def run_once(matcher: FingerprintMatcher) -> None:
    """One pass of the loop: heartbeat, wait for a chunk, handle it."""
    write_heartbeat()

    logger.info("Waiting for audio chunks...")
    job_data = redis_conn.brpop(QUEUE_KEY, timeout=BRPOP_TIMEOUT)

    if job_data:
        _, job_json = job_data
        logger.info(f"Received job: {job_json}")
        process_job(job_json, matcher)


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
