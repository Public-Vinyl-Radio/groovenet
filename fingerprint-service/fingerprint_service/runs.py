"""Progress counters for one library-indexing run (#277).

The CLI needs to show a moving count and a final summary, and with one queue job
per reference track there is no single job to hang that off. So the app mints a
run when it enqueues, seeds it with the totals it knows, and this service counts
each track as it finishes; the app reads the hash back for the status endpoint.

Redis rather than Postgres because the numbers are transient, written once per
track, and worthless an hour after the run ends — a table would be a migration
and a cleanup job for data with a natural TTL.

The connection is passed in rather than imported. `main` holds the module global
the test suite patches, and a second module reaching for its own would quietly
escape that.
"""
import time

from .config import INDEX_RUN_KEY_PREFIX, INDEX_RUN_TTL, logger
from .types import IndexOutcome

#: Counter fields. `unindexable` is seeded by the app and never touched here —
#: a track with no `local_audio_url` has no file to fingerprint and so never
#: reaches the queue at all. It is reported because "how much of the library is
#: indexable" is the question the first run exists to answer.
COUNTERS = ("indexed", "skipped", "failed")

#: Kept to the most recent failures. A run where every file is broken should
#: cost a bounded amount of Redis, and the logs hold the full story either way.
MAX_RECORDED_ERRORS = 50


def run_key(run_id: str) -> str:
    return f"{INDEX_RUN_KEY_PREFIX}{run_id}"


def record_outcome(redis_conn, result: IndexOutcome) -> None:
    """Count one finished track against its run.

    Failures are never fatal here: losing a counter costs an accurate progress
    bar, and dropping the track's actual work on the floor to protect a progress
    bar would be the wrong trade.
    """
    status = result["status"]
    if status not in COUNTERS:
        logger.warning("Ignoring unknown outcome status %r", status)
        return

    key = run_key(result["run_id"])
    try:
        pipeline = redis_conn.pipeline()
        pipeline.hincrby(key, status, 1)
        pipeline.hset(key, "updated_at", int(time.time() * 1000))
        if result.get("error"):
            pipeline.rpush(
                f"{key}:errors",
                f"{result['track_id']}: {result['error']}",
            )
            pipeline.ltrim(f"{key}:errors", -MAX_RECORDED_ERRORS, -1)
            pipeline.expire(f"{key}:errors", INDEX_RUN_TTL)
        pipeline.expire(key, INDEX_RUN_TTL)
        pipeline.execute()
    except Exception as e:
        logger.warning("Failed to record outcome for run %s: %s", result["run_id"], e)
