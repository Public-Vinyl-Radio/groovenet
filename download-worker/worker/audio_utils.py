import json
import os
import shutil
from typing import TYPE_CHECKING

import requests

from .config import logger
from .subprocess_utils import run_subprocess

if TYPE_CHECKING:
    from .types import JobData


def cleanup_download_directory(download_dir: str, track_id: str) -> None:
    try:
        for item in os.listdir(download_dir):
            item_path = os.path.join(download_dir, item)
            try:
                if os.path.isdir(item_path):
                    shutil.rmtree(item_path)
                    logger.info(f"Cleaned up directory: {item}")
                elif os.path.isfile(item_path):
                    os.unlink(item_path)
                    logger.info(f"Cleaned up file: {item}")
            except Exception as e:
                logger.warning(f"Could not clean up {item}: {e}")
        logger.info(f"Download directory cleanup completed for track {track_id}")
    except Exception as e:
        logger.error(f"Download directory cleanup failed: {e}")
        raise


def extract_year_from_tag(value: str) -> int | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    if not value:
        return None
    for i in range(0, len(value) - 3):
        part = value[i:i + 4]
        if part.isdigit():
            year = int(part)
            if 1800 <= year <= 2100:
                return year
    return None


def get_audio_metadata_year(
    file_path: str,
    log_sink: list[str] | None = None,
) -> int | None:
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_entries", "format_tags",
        file_path,
    ]
    result = run_subprocess(cmd, timeout=30, log_sink=log_sink)
    if result.returncode != 0:
        logger.warning("ffprobe metadata probe failed for year extraction: %s", result.stderr)
        return None

    try:
        payload = json.loads(result.stdout or "{}")
    except Exception as e:
        logger.warning("ffprobe metadata json parse failed: %s", e)
        return None

    tags = ((payload.get("format") or {}).get("tags") or {})
    if not isinstance(tags, dict):
        return None

    for key in ["date", "year", "originaldate", "original_date", "release_date", "creation_time"]:
        value = tags.get(key)
        year = extract_year_from_tag(value) if isinstance(value, str) else None
        if year is not None:
            return year

    for value in tags.values():
        year = extract_year_from_tag(value) if isinstance(value, str) else None
        if year is not None:
            return year

    return None


def get_duration_seconds(
    file_path: str,
    log_sink: list[str] | None = None,
) -> int:
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        file_path,
    ]
    result = run_subprocess(cmd, timeout=30, log_sink=log_sink)
    if result.returncode != 0:
        raise Exception(f"ffprobe failed: {result.stderr}")
    try:
        duration = float(result.stdout.strip())
    except Exception as e:
        raise Exception(f"ffprobe duration parse failed: {e}")
    if duration <= 0:
        raise Exception("ffprobe returned non-positive duration")
    return int(round(duration))


def get_embedded_art_stream_index(
    file_path: str,
    log_sink: list[str] | None = None,
) -> int | None:
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_streams",
        file_path,
    ]
    result = run_subprocess(cmd, timeout=30, log_sink=log_sink)
    if result.returncode != 0:
        raise Exception(f"ffprobe stream probe failed: {result.stderr}")

    try:
        payload = json.loads(result.stdout or "{}")
    except Exception as e:
        raise Exception(f"ffprobe json parse failed: {e}")

    streams = payload.get("streams", [])
    for stream in streams:
        if (stream.get("disposition") or {}).get("attached_pic") == 1:
            idx = stream.get("index")
            if isinstance(idx, int):
                return idx

    for stream in streams:
        if stream.get("codec_type") == "video":
            idx = stream.get("index")
            if isinstance(idx, int):
                return idx

    return None


def ensure_local_audio_file(
    job_data: "JobData",
    log_sink: list[str] | None = None,
) -> str:
    local_audio_url = job_data.get("local_audio_url")
    if not local_audio_url:
        raise Exception("Job missing local_audio_url")

    audio_dir = "/app/audio"
    if os.path.exists(local_audio_url):
        return local_audio_url

    filename = os.path.basename(local_audio_url)
    candidate = os.path.join(audio_dir, filename)
    if os.path.exists(candidate):
        return candidate

    app_url = os.getenv("APP_URL", "http://app:3000")
    audio_url = f"{app_url}/api/audio?filename={filename}"
    tmp_path = f"/tmp/{filename}"
    logger.info(f"Downloading audio for local processing: {audio_url}")
    if log_sink is not None:
        log_sink.append(f"Fetching audio file: {audio_url}")
    with requests.get(audio_url, stream=True, timeout=60) as response:
        if not response.ok:
            raise Exception(f"Failed to fetch audio: {response.status_code} {response.text}")
        with open(tmp_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    f.write(chunk)
    return tmp_path
