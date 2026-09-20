import time
import traceback

from ..audio_utils import ensure_local_audio_file, get_duration_seconds
from ..config import logger
from ..redis_utils import append_job_logs, update_job_status
from ..track_api import update_track_duration
from ..types import JobData, JobResult


def fix_duration(job_data: JobData) -> JobResult:
    track_id = job_data['track_id']
    friend_id = job_data['friend_id']
    job_id = job_data.get('job_id', f"{track_id}_{int(time.time())}")
    log_sink: list[str] = []

    logger.info(f"Starting duration fix job {job_id} for track {track_id}")
    update_job_status(job_id, 'processing', 10)

    try:
        audio_path = ensure_local_audio_file(job_data, log_sink=log_sink)
        update_job_status(job_id, 'processing', 50)
        append_job_logs(job_id, log_sink)
        log_sink.clear()

        duration_seconds = get_duration_seconds(audio_path, log_sink=log_sink)
        update_job_status(job_id, 'processing', 80)
        append_job_logs(job_id, log_sink)
        log_sink.clear()

        update_track_duration(track_id, friend_id, duration_seconds)

        result = {
            'success': True,
            'track_id': track_id,
            'friend_id': friend_id,
            'duration_seconds': duration_seconds,
        }
        update_job_status(job_id, 'completed', 100, result=result)
        logger.info(f"Duration job {job_id} completed successfully")
        return result

    except Exception as e:
        error_msg = f"Duration fix failed: {str(e)}"
        logger.error(f"Job {job_id} failed: {error_msg}")
        logger.error(traceback.format_exc())
        log_sink.append(f"ERROR: {error_msg}")
        log_sink.append(traceback.format_exc())
        append_job_logs(job_id, log_sink)
        update_job_status(job_id, 'failed', 0, error=error_msg)
        return {'success': False, 'error': error_msg, 'track_id': track_id, 'friend_id': friend_id}
