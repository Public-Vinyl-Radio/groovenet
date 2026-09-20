import os
import time
import traceback

import requests

from ..audio_utils import ensure_local_audio_file, get_embedded_art_stream_index
from ..config import logger
from ..redis_utils import append_job_logs, update_job_status
from ..subprocess_utils import run_subprocess
from ..track_api import update_track_album_art_url
from ..types import JobData, JobResult


def extract_embedded_cover_art(job_data: JobData) -> JobResult:
    track_id = job_data['track_id']
    friend_id = job_data['friend_id']
    job_id = job_data.get('job_id', f"{track_id}_{int(time.time())}")
    log_sink: list[str] = []

    logger.info(f"Starting cover art extraction job {job_id} for track {track_id}")
    update_job_status(job_id, 'processing', 10)

    try:
        audio_path = ensure_local_audio_file(job_data, log_sink=log_sink)
        update_job_status(job_id, 'processing', 35)
        append_job_logs(job_id, log_sink)
        log_sink.clear()

        stream_index = get_embedded_art_stream_index(audio_path, log_sink=log_sink)
        if stream_index is None:
            raise Exception("No embedded cover art stream found")

        output_dir = "/app/public/uploads/album-covers"
        os.makedirs(output_dir, exist_ok=True)
        safe_track_id = "".join(c if c.isalnum() or c in "._-" else "_" for c in track_id)
        output_file = f"{safe_track_id}_{friend_id}.jpg"
        output_path = os.path.join(output_dir, output_file)

        ffmpeg_cmd = [
            "ffmpeg", "-y", "-i", audio_path,
            "-map", f"0:{stream_index}",
            "-frames:v", "1",
            output_path,
        ]
        result = run_subprocess(ffmpeg_cmd, timeout=60, log_sink=log_sink)
        if result.returncode != 0:
            raise Exception(f"ffmpeg cover extraction failed: {result.stderr}")

        update_job_status(job_id, 'processing', 80)
        append_job_logs(job_id, log_sink)
        log_sink.clear()

        public_url = f"/uploads/album-covers/{output_file}"
        update_track_album_art_url(track_id, friend_id, public_url)

        payload_local_audio_url = (job_data.get("local_audio_url") or "").strip()
        if audio_path.startswith("/tmp/") and (
            not payload_local_audio_url or not os.path.exists(payload_local_audio_url)
        ):
            try:
                os.unlink(audio_path)
            except Exception:
                pass

        result_payload = {
            'success': True,
            'track_id': track_id,
            'friend_id': friend_id,
            'audio_file_album_art_url': public_url,
        }
        update_job_status(job_id, 'completed', 100, result=result_payload)
        logger.info(f"Cover art job {job_id} completed successfully")
        return result_payload

    except Exception as e:
        error_msg = f"Cover art extraction failed: {str(e)}"
        logger.error(f"Job {job_id} failed: {error_msg}")
        logger.error(traceback.format_exc())
        log_sink.append(f"ERROR: {error_msg}")
        log_sink.append(traceback.format_exc())
        append_job_logs(job_id, log_sink)
        update_job_status(job_id, 'failed', 0, error=error_msg)
        return {'success': False, 'error': error_msg, 'track_id': track_id, 'friend_id': friend_id}


def extract_embedded_cover_art_album(job_data: JobData) -> JobResult:
    track_id = job_data['track_id']
    friend_id = job_data['friend_id']
    release_id = job_data.get('release_id')
    job_id = job_data.get('job_id', f"{track_id}_{int(time.time())}")
    log_sink: list[str] = []

    logger.info(
        "Starting album cover extraction job %s for release %s (friend %s)",
        job_id, release_id, friend_id,
    )
    update_job_status(job_id, 'processing', 10)

    try:
        if not release_id:
            raise Exception("Missing release_id for extract-cover-art-album job")

        app_url = os.getenv('APP_URL', 'http://app:3000')
        endpoint = f"{app_url}/api/albums/extract-cover-art-from-audio"
        payload = {"release_id": release_id, "friend_id": friend_id}

        update_job_status(job_id, 'processing', 60)
        log_sink.append(f"POST {endpoint}")
        append_job_logs(job_id, log_sink)
        log_sink.clear()

        response = requests.post(
            endpoint,
            json=payload,
            headers={'Content-Type': 'application/json'},
            timeout=180,
        )
        if not response.ok:
            raise Exception(
                f"Album cover extraction API failed: {response.status_code} {response.text}"
            )

        result_payload = response.json()
        result_payload['success'] = True
        update_job_status(job_id, 'completed', 100, result=result_payload)
        logger.info("Album cover extraction job %s completed", job_id)
        return result_payload

    except Exception as e:
        error_msg = f"Album cover extraction failed: {str(e)}"
        logger.error(f"Job {job_id} failed: {error_msg}")
        logger.error(traceback.format_exc())
        log_sink.append(f"ERROR: {error_msg}")
        log_sink.append(traceback.format_exc())
        append_job_logs(job_id, log_sink)
        update_job_status(job_id, 'failed', 0, error=error_msg)
        return {
            'success': False,
            'error': error_msg,
            'track_id': track_id,
            'friend_id': friend_id,
            'release_id': release_id,
        }
