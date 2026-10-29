import json
import os
import time
from typing import Any

import requests
from groovenet_client.types import TrackUpdate

from .app_api import get_groovenet_client
from .audio_utils import get_audio_metadata_year
from .config import ESSENTIA_DATA_DIR, logger
from .essentia_bpm import extract_bpm_confidence
from .essentia_key import extract_key_analysis, log_key_profile_disagreement
from .subprocess_utils import run_subprocess


def report_job_outcome(job_id: str) -> None:
    """Tell the app a job has ended, once its terminal status is in Redis.

    The app reads the outcome from the job's record and counts it for
    analytics, so there is no body. Best-effort: a lost report costs a data
    point, never the job.
    """
    try:
        get_groovenet_client().report_job_outcome(job_id, timeout=10)
    except Exception as e:
        logger.warning(f"Job {job_id} outcome report failed: {e}")


def save_essentia_analysis_file(
    track_id: str,
    friend_id: int,
    analysis_data: dict[str, Any],
) -> str:
    os.makedirs(ESSENTIA_DATA_DIR, exist_ok=True)
    safe_track_id = "".join(c if c.isalnum() or c in "._-" else "_" for c in track_id)
    file_path = os.path.join(ESSENTIA_DATA_DIR, f"{safe_track_id}_{friend_id}.json")
    payload = {
        "track_id": track_id,
        "friend_id": friend_id,
        "saved_at": int(time.time() * 1000),
        "analysis": analysis_data,
    }
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return file_path


def update_track_analysis(
    track_id: str,
    friend_id: int,
    analysis_data: dict[str, Any],
    audio_year: int | None = None,
) -> None:
    try:
        bpm = None
        bpm_confidence = None
        key = None
        key_confidence = None
        danceability = None
        duration_seconds = None
        mood_happy = None
        mood_sad = None
        mood_relaxed = None
        mood_aggressive = None

        if "rhythm" in analysis_data and analysis_data["rhythm"]:
            rhythm = analysis_data["rhythm"]
            if "bpm" in rhythm and isinstance(rhythm["bpm"], (int, float)):
                bpm = int(round(rhythm["bpm"]))
                bpm_confidence = extract_bpm_confidence(rhythm)
            if "danceability" in rhythm and isinstance(rhythm["danceability"], (int, float)):
                danceability = round(rhythm["danceability"], 3)

        if "tonal" in analysis_data and analysis_data["tonal"]:
            tonal = analysis_data["tonal"]
            key, key_confidence = extract_key_analysis(tonal)
            log_key_profile_disagreement(tonal, track_id, friend_id)

        if "metadata" in analysis_data and analysis_data["metadata"]:
            metadata = analysis_data["metadata"]
            if "audio_properties" in metadata and metadata["audio_properties"]:
                audio_props = metadata["audio_properties"]
                if "length" in audio_props and isinstance(audio_props["length"], (int, float)):
                    duration_seconds = int(round(audio_props["length"]))

        if "highlevel" in analysis_data and analysis_data["highlevel"]:
            highlevel = analysis_data["highlevel"]
            mood_happy = _extract_highlevel_mood(highlevel, "mood_happy", "happy")
            mood_sad = _extract_highlevel_mood(highlevel, "mood_sad", "sad")
            mood_relaxed = _extract_highlevel_mood(highlevel, "mood_relaxed", "relaxed")
            mood_aggressive = _extract_highlevel_mood(highlevel, "mood_aggressive", "aggressive")

        body: TrackUpdate = {"track_id": track_id, "friend_id": friend_id}
        if bpm is not None:
            body["bpm"] = bpm
        if bpm_confidence is not None:
            body["bpm_confidence"] = bpm_confidence
        if key:
            body["key"] = key
        if key_confidence is not None:
            body["key_confidence"] = key_confidence
        if danceability is not None:
            body["danceability"] = danceability
        if duration_seconds is not None:
            body["duration_seconds"] = duration_seconds
        if mood_happy is not None:
            body["mood_happy"] = mood_happy
        if mood_sad is not None:
            body["mood_sad"] = mood_sad
        if mood_relaxed is not None:
            body["mood_relaxed"] = mood_relaxed
        if mood_aggressive is not None:
            body["mood_aggressive"] = mood_aggressive
        if audio_year is not None:
            body["year"] = str(audio_year)

        get_groovenet_client().update_track(body)
        logger.info(f"Track {track_id} updated with analysis data")

    except Exception as e:
        logger.error(f"Failed to update track analysis: {e}")
        raise


def _extract_highlevel_mood(
    highlevel_data: dict[str, Any],
    section: str,
    key: str,
) -> float | None:
    section_data = highlevel_data.get(section)
    if not isinstance(section_data, dict):
        return None
    all_data = section_data.get("all")
    if not isinstance(all_data, dict):
        return None
    value = all_data.get(key)
    if not isinstance(value, (int, float)):
        return None
    return round(float(value), 3)


def analyze_audio_file(
    file_path: str,
    track_id: str,
    friend_id: int,
    log_sink: list[str] | None = None,
) -> dict[str, Any]:
    # Write the WAV into the shared audio dir the app serves from — NOT next to
    # the source file, which may be a worker-local /tmp download the app can't
    # see. Essentia has no access to the audio volume, so it fetches the WAV
    # from the app by filename; the file must therefore live under AUDIO_DIR.
    audio_dir = os.getenv("AUDIO_DIR", "/app/audio")
    wav_path = os.path.join(audio_dir, os.path.splitext(os.path.basename(file_path))[0] + ".wav")
    try:
        # -vn drops any embedded cover-art/video stream, which otherwise
        # trips up the Essentia extractor on some files.
        ffmpeg_cmd = ["ffmpeg", "-y", "-i", file_path, "-vn", "-ac", "1", wav_path]
        result = run_subprocess(ffmpeg_cmd, timeout=120, log_sink=log_sink)

        if result.returncode != 0:
            raise Exception(f"FFmpeg conversion failed: {result.stderr}")

        if not os.path.exists(wav_path) or os.path.getsize(wav_path) == 0:
            raise Exception("WAV conversion produced empty file")

        wav_filename = os.path.basename(wav_path)
        audio_url = f"http://app:3000/api/audio?filename={wav_filename}"
        essentia_url = os.getenv("ESSENTIA_API_URL", "http://essentia:8001/analyze")

        logger.info(f"Calling Essentia API: {essentia_url}")
        if log_sink is not None:
            log_sink.append(f"Calling Essentia: {essentia_url} with {wav_filename}")

        response = requests.post(essentia_url, json={"filename": audio_url}, timeout=300)
        if not response.ok:
            raise Exception(f"Essentia API error: {response.status_code} {response.text}")

        analysis_result = response.json()

        # Essentia (older builds) may return HTTP 200 with an error payload
        # instead of a real analysis. Treat that as a hard failure so the job
        # is marked failed rather than silently storing nothing.
        if not isinstance(analysis_result, dict):
            raise Exception(f"Essentia returned unexpected payload: {analysis_result!r}")
        if "error" in analysis_result or "detail" in analysis_result:
            err = analysis_result.get("error") or analysis_result.get("detail")
            raise Exception(f"Essentia analysis error: {err}")
        if not any(k in analysis_result for k in ("rhythm", "tonal", "metadata")):
            raise Exception(f"Essentia returned no analysis fields (keys: {sorted(analysis_result.keys())})")

        logger.info("Audio analysis completed successfully")

        try:
            saved_file = save_essentia_analysis_file(track_id, friend_id, analysis_result)
            logger.info("Saved Essentia analysis JSON to %s", saved_file)
        except Exception as save_err:
            logger.warning("Failed to save Essentia analysis JSON: %s", save_err)

        if os.path.exists(wav_path):
            os.unlink(wav_path)

        audio_year = get_audio_metadata_year(file_path, log_sink=log_sink)
        update_track_analysis(track_id, friend_id, analysis_result, audio_year=audio_year)

        return analysis_result

    except Exception as e:
        logger.error(f"Audio analysis failed: {e}")
        if os.path.exists(wav_path):
            os.unlink(wav_path)
        raise


def update_track_duration(track_id: str, friend_id: int, duration_seconds: int) -> None:
    logger.info(f"Updating track duration for {track_id}")
    body: TrackUpdate = {"track_id": track_id, "friend_id": friend_id}
    body["duration_seconds"] = duration_seconds
    get_groovenet_client().update_track(body)


def update_track_album_art_url(track_id: str, friend_id: int, album_art_url: str) -> None:
    logger.info(f"Updating track album art for {track_id}")
    body: TrackUpdate = {"track_id": track_id, "friend_id": friend_id}
    body["audio_file_album_art_url"] = album_art_url
    get_groovenet_client().update_track(body)
