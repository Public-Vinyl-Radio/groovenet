import time
import traceback

from ..audio_utils import ensure_local_audio_file
from ..config import logger
from ..redis_utils import append_job_logs, update_job_status
from ..track_api import analyze_audio_file
from ..types import JobData, JobResult


def analyze_local_audio(job_data: JobData) -> JobResult:
    track_id = job_data['track_id']
    friend_id = job_data['friend_id']
    job_id = job_data.get('job_id', f"{track_id}_{int(time.time())}")
    log_sink: list[str] = []

    logger.info(f"Starting local analysis job {job_id} for track {track_id}")
    update_job_status(job_id, 'processing', 10)

    try:
        audio_path = ensure_local_audio_file(job_data, log_sink=log_sink)
        update_job_status(job_id, 'processing', 35)
        append_job_logs(job_id, log_sink)
        log_sink.clear()

        analysis_result = analyze_audio_file(audio_path, track_id, friend_id, log_sink=log_sink)
        update_job_status(job_id, 'processing', 90)
        append_job_logs(job_id, log_sink)
        log_sink.clear()

        result = {
            'success': True,
            'track_id': track_id,
            'friend_id': friend_id,
            'analysis': analysis_result,
        }
        update_job_status(job_id, 'completed', 100, result=result)
        logger.info(f"Local analysis job {job_id} completed successfully")
        return result

    except Exception as e:
        error_msg = f"Local analysis failed: {str(e)}"
        logger.error(f"Job {job_id} failed: {error_msg}")
        logger.error(traceback.format_exc())
        log_sink.append(f"ERROR: {error_msg}")
        log_sink.append(traceback.format_exc())
        append_job_logs(job_id, log_sink)
        update_job_status(job_id, 'failed', 0, error=error_msg)
        return {'success': False, 'error': error_msg, 'track_id': track_id, 'friend_id': friend_id}
