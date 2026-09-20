import json
import time

from .config import (
    JOB_TTL_ACTIVE_SECONDS,
    JOB_TTL_TERMINAL_SECONDS,
    JOBS_UPDATED_INDEX_KEY,
    logger,
    redis_conn,
)


def update_job_status(
    job_id: str,
    status: str,
    progress: int = 0,
    error: str = None,
    result: dict = None,
    analysis_error: str = None,
):
    now_ms = int(time.time() * 1000)
    job_data = {
        'status': status,
        'progress': progress,
        'updated_at': now_ms,
    }
    if error:
        job_data['error'] = error
    if analysis_error:
        # Non-fatal analysis failure on an otherwise successful job. Recorded as
        # a first-class field so the UI can flag it without parsing the result.
        job_data['analysis_error'] = analysis_error
    if result:
        job_data['result'] = json.dumps(result)

    job_key = f"job:{job_id}"
    ttl = JOB_TTL_TERMINAL_SECONDS if status in {'completed', 'failed'} else JOB_TTL_ACTIVE_SECONDS

    pipeline = redis_conn.pipeline()
    pipeline.hset(job_key, mapping=job_data)
    if status == 'processing':
        pipeline.hsetnx(job_key, 'started_at', now_ms)
    pipeline.zadd(JOBS_UPDATED_INDEX_KEY, {job_id: now_ms})
    pipeline.expire(job_key, ttl)
    pipeline.execute()
    logger.info(f"Job {job_id} status updated to {status} (progress: {progress}%)")


def append_job_logs(job_id: str, lines: list[str]) -> None:
    if not lines:
        return
    key = f"job:{job_id}:logs"
    pipeline = redis_conn.pipeline()
    for line in lines:
        pipeline.rpush(key, line)
    pipeline.expire(key, JOB_TTL_ACTIVE_SECONDS)
    pipeline.execute()
