import json
import time
import traceback
from collections.abc import Callable

import redis

from .config import HEARTBEAT_KEY, HEARTBEAT_TTL, logger, redis_conn
from .jobs.analyze import analyze_local_audio
from .jobs.cover_art import extract_embedded_cover_art, extract_embedded_cover_art_album
from .jobs.download import download_audio, has_download_urls
from .jobs.duration import fix_duration
from .types import JobData, JobResult

QUEUE_KEY = "download_queue"
BRPOP_TIMEOUT = 5

JobHandler = Callable[[JobData], JobResult]

#: Explicit job types, keyed by the aliases the queue may use. Anything not
#: listed here falls through to :func:`select_handler`'s content-based routing.
JOB_HANDLERS: dict[str, JobHandler] = {
    "fix-duration": fix_duration,
    "fix_duration": fix_duration,
    "analyze-local": analyze_local_audio,
    "analyze_local": analyze_local_audio,
    "extract-cover-art-album": extract_embedded_cover_art_album,
    "extract_cover_art_album": extract_embedded_cover_art_album,
    "extract-cover-art": extract_embedded_cover_art,
    "extract_cover_art": extract_embedded_cover_art,
}


def normalize_job_type(job: JobData) -> str:
    """Job type as the dispatch table keys it, defaulting to ``download``."""
    return str(job.get("job_type", "download")).strip().lower()


def select_handler(job: JobData) -> JobHandler:
    """Pick the handler for a job.

    An explicit job_type wins. Otherwise a job that names local audio but no
    remote URL is analyzed in place rather than sent to the downloader.
    """
    handler = JOB_HANDLERS.get(normalize_job_type(job))
    if handler is not None:
        return handler

    if job.get("local_audio_url") and not has_download_urls(job):
        logger.info(
            "No remote URLs for job %s; using local audio analysis",
            job.get("job_id"),
        )
        return analyze_local_audio

    return download_audio


def verify_redis() -> bool:
    """Ping Redis once at startup. False means the worker should not start."""
    try:
        redis_conn.ping()
        logger.info("Redis connection successful")
        queue_length = redis_conn.llen(QUEUE_KEY)
        logger.info(f"Current queue length: {queue_length}")
        return True
    except Exception as e:
        logger.error(f"Redis connection failed: {e}")
        return False


def write_heartbeat() -> None:
    """Refresh the liveness key the container HEALTHCHECK reads.

    brpop wakes at least every BRPOP_TIMEOUT seconds, so this stays fresh while
    the loop is alive. A failure here must not take the worker down.
    """
    try:
        redis_conn.set(HEARTBEAT_KEY, int(time.time()), ex=HEARTBEAT_TTL)
    except Exception as hb_err:
        logger.warning(f"Failed to write heartbeat: {hb_err}")


def process_job(job_json: str) -> JobResult | None:
    """Parse one queue payload and run its handler.

    Job-level failures are logged and swallowed so one bad job cannot stop the
    worker; the return value is the handler's result, or None on failure.
    """
    try:
        job = json.loads(job_json)
        result = select_handler(job)(job)
        logger.info(f"Job {job.get('job_id')} completed with result: {result}")
        return result
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse job JSON: {e}")
        return None
    except Exception as e:
        logger.error(f"Job processing failed: {e}")
        logger.error(traceback.format_exc())
        return None


def run_once() -> None:
    """One pass of the worker loop: heartbeat, wait for a job, handle it."""
    write_heartbeat()

    logger.info("Waiting for jobs...")
    job_data = redis_conn.brpop(QUEUE_KEY, timeout=BRPOP_TIMEOUT)

    if job_data:
        _, job_json = job_data
        logger.info(f"Received job: {job_json}")
        process_job(job_json)


def main() -> None:
    logger.info("Starting download worker...")
    logger.info(f"Connecting to Redis: {redis_conn.connection_pool.connection_kwargs}")

    if not verify_redis():
        return

    while True:
        try:
            run_once()
        except redis.ConnectionError as e:
            logger.error(f"Redis connection error: {e}")
            time.sleep(5)
        except KeyboardInterrupt:
            logger.info("Worker stopped by user")
            break
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            logger.error(traceback.format_exc())
            time.sleep(1)


if __name__ == "__main__":
    main()
