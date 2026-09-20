import os
import re
import shutil
import subprocess
import time
import traceback

from groovenet_client.api.tracks import patch_api_tracks
from groovenet_client.models import PatchApiTracksBody

from ..audio_utils import cleanup_download_directory
from ..config import logger
from ..redis_utils import append_job_logs, update_job_status
from ..subprocess_utils import run_subprocess
from ..track_api import analyze_audio_file, get_groovenet_client
from ..types import JobData, JobResult
from .analyze import analyze_local_audio


def resolve_gamdl_cookie_file() -> str | None:
    configured_path = os.getenv('GAMDL_COOKIE_FILE')
    candidates: list[str] = []

    if configured_path:
        candidates.append(configured_path)

    # Backwards-compatible fallbacks for older local setups.
    candidates.extend([
        '/app/cookies/gamdl_cookies.txt',
        '/app/cookies/music.apple.com_cookies.txt',
    ])

    seen: set[str] = set()
    for path in candidates:
        if not path or path in seen:
            continue
        seen.add(path)
        if os.path.exists(path):
            return path

    return configured_path


def has_download_urls(job_data: JobData) -> bool:
    for key in ['apple_music_url', 'youtube_url', 'soundcloud_url']:
        value = job_data.get(key)
        if isinstance(value, str) and value.strip():
            return True
    return False


def download_with_gamdl(
    url: str,
    output_dir: str,
    track_id: str,
    job_data: JobData | None = None,
    log_sink: list[str] | None = None,
) -> str | None:
    try:
        quality = 'best'
        if job_data and 'quality' in job_data:
            quality = job_data['quality']

        cmd = [
            'gamdl',
            '--output-path', output_dir,
            '--log-level', 'INFO',
            '--no-exceptions',
        ]

        if quality != 'best':
            cmd.extend(['--audio-quality', quality])

        cookie_file = resolve_gamdl_cookie_file()
        if cookie_file:
            if os.path.exists(cookie_file):
                try:
                    with open(cookie_file) as f:
                        content = f.read().strip()
                    if not content:
                        logger.warning("Cookie file is empty")
                    elif 'apple' not in content.lower():
                        logger.warning("Cookie file may not contain Apple Music cookies")
                    else:
                        cmd.extend(['--cookies-path', cookie_file])
                        logger.info(f"Using gamdl cookie file: {cookie_file}")
                        lines = content.split('\n')
                        apple_lines = [line for line in lines if 'apple' in line.lower()]
                        logger.info(f"Using cookie file with {len(apple_lines)} Apple entries")
                except Exception as e:
                    logger.warning(f"Could not validate cookie file: {e}")
            else:
                logger.warning(f"Cookie file not found: {cookie_file}")
        else:
            logger.info("No cookie file specified")

        before_files: set = set()
        try:
            before_files = set(os.listdir(output_dir))
        except Exception:
            pass

        cmd.append(url)
        result = run_subprocess(cmd, timeout=600, log_sink=log_sink)

        if result.stderr:
            track_matches = re.findall(r'\(Track \d+/\d+ from URL \d+/\d+\) "([^"]+)"', result.stderr)
            if track_matches:
                logger.info(f"gamdl processed tracks: {track_matches}")
            url_matches = re.findall(r'Processing "([^"]+)"', result.stderr)
            if url_matches and url_matches[0] != url:
                logger.error(f"URL MISMATCH: Expected {url}, gamdl processed {url_matches[0]}")

        if result.returncode != 0:
            stderr_lower = result.stderr.lower() if result.stderr else ""
            if "unauthorized" in stderr_lower or "401" in stderr_lower:
                raise Exception("Authentication failed - cookie file may be expired or invalid")
            elif "not found" in stderr_lower or "404" in stderr_lower:
                raise Exception("Track not found on Apple Music")
            elif "region" in stderr_lower or "geo" in stderr_lower:
                raise Exception("Track not available in your region")
            elif "rate limit" in stderr_lower or "too many requests" in stderr_lower:
                raise Exception("Rate limited by Apple Music - please try again later")
            elif "premium" in stderr_lower or "subscription" in stderr_lower:
                raise Exception("Apple Music subscription required")
            else:
                raise Exception(f"gamdl failed: {result.stderr}")

        # Handle "already exists" case
        if result.stderr:
            existing_match = re.search(r"Media file already exists at '([^']+)'", result.stderr)
            if existing_match:
                existing_file_path = existing_match.group(1)
                logger.info(f"gamdl found existing file: {existing_file_path}")
                if os.path.exists(existing_file_path) and os.path.getsize(existing_file_path) > 0:
                    file_ext = os.path.splitext(existing_file_path)[1]
                    new_filepath = os.path.join(output_dir, f"{track_id}{file_ext}")
                    try:
                        shutil.copy2(existing_file_path, new_filepath)
                        return new_filepath
                    except Exception as e:
                        logger.warning(f"Could not copy file: {e}, using original path")
                        return existing_file_path

        after_files: set = set()
        try:
            after_files = set(os.listdir(output_dir))
        except Exception:
            pass

        new_items = after_files - before_files
        search_all_files = len(new_items) == 0
        if search_all_files:
            logger.info("No new items detected, searching entire directory for audio files")

        downloaded_files: list[str] = []

        def find_audio_files(search_path: str, max_depth: int = 3, current_depth: int = 0) -> None:
            if current_depth > max_depth:
                return
            try:
                for item in os.listdir(search_path):
                    item_path = os.path.join(search_path, item)
                    if os.path.isfile(item_path):
                        if any(item.endswith(ext) for ext in ['.m4a', '.mp3', '.aac', '.flac']):
                            if os.path.getsize(item_path) > 0:
                                downloaded_files.append(item_path)
                    elif os.path.isdir(item_path) and current_depth < max_depth:
                        find_audio_files(item_path, max_depth, current_depth + 1)
            except Exception as e:
                logger.warning(f"Error searching {search_path}: {e}")

        if search_all_files:
            find_audio_files(output_dir)
        else:
            for item in new_items:
                item_path = os.path.join(output_dir, item)
                if os.path.isdir(item_path):
                    find_audio_files(item_path)
                elif os.path.isfile(item_path):
                    if any(item.endswith(ext) for ext in ['.m4a', '.mp3', '.aac', '.flac']):
                        if os.path.getsize(item_path) > 0:
                            downloaded_files.append(item_path)

        if not downloaded_files:
            logger.error(f"No audio files found. New items: {new_items}")
            raise Exception(f"Downloaded file not found for track_id {track_id}")

        return max(downloaded_files, key=os.path.getsize)

    except subprocess.TimeoutExpired:
        raise Exception("Download timeout (10 minutes) - try lower quality or check connection")
    except Exception as e:
        error_msg = str(e)
        if "gamdl error:" not in error_msg:
            error_msg = f"gamdl error: {error_msg}"
        logger.error(f"gamdl download failed for {url}: {error_msg}")
        raise Exception(error_msg)


def download_with_ytdlp(
    url: str,
    output_dir: str,
    track_id: str,
    log_sink: list[str] | None = None,
) -> str | None:
    try:
        output_template = f"{output_dir}/{track_id}.%(ext)s"

        strategies = [
            {
                'args': [
                    'yt-dlp', '--extractor-args', 'youtube:player_client=android',
                    '-f', 'bestaudio[ext=m4a]/bestaudio/best',
                    '-x', '--audio-format', 'm4a', '--no-playlist',
                    '--output', output_template, url,
                ],
                'name': 'Android client',
            },
            {
                'args': [
                    'yt-dlp', '--extractor-args', 'youtube:player_client=ios',
                    '-f', 'bestaudio/best',
                    '-x', '--audio-format', 'm4a', '--no-playlist',
                    '--output', output_template, url,
                ],
                'name': 'iOS client',
            },
            {
                'args': [
                    'yt-dlp', '--extractor-args', 'youtube:player_client=web',
                    '-f', 'ba/b', '-x', '--audio-format', 'm4a',
                    '--output', output_template, url,
                ],
                'name': 'Web client',
            },
            {
                'args': [
                    'yt-dlp', '-f', 'bestaudio/best',
                    '-x', '--audio-format', 'm4a',
                    '--output', output_template, url,
                ],
                'name': 'Default extraction',
            },
        ]

        last_error = None
        for i, strategy in enumerate(strategies, 1):
            logger.info(f"Trying strategy {i}/{len(strategies)}: {strategy['name']}")
            try:
                result = run_subprocess(strategy['args'], timeout=300, log_sink=log_sink)
                if result.returncode == 0:
                    for file in os.listdir(output_dir):
                        if file.startswith(track_id) and (file.endswith('.m4a') or file.endswith('.mp3')):
                            logger.info(f"Downloaded with strategy: {strategy['name']}")
                            return os.path.join(output_dir, file)
                    logger.warning(f"Strategy {strategy['name']} completed but file not found")
                else:
                    last_error = _extract_ytdlp_error(result.stderr)
            except subprocess.TimeoutExpired:
                logger.warning(f"Strategy {strategy['name']} timed out")
                last_error = "Download timeout"
            except Exception as e:
                logger.warning(f"Strategy {strategy['name']} error: {e}")
                last_error = str(e)

        raise Exception(f"All download strategies failed. Last error: {last_error}")

    except Exception as e:
        raise Exception(f"yt-dlp error: {str(e)}")


def _extract_ytdlp_error(stderr: str) -> str:
    """Return the first ERROR: line from yt-dlp stderr, or the full stderr if none found."""
    for line in (stderr or "").splitlines():
        stripped = line.strip()
        if stripped.startswith("ERROR:"):
            return stripped[len("ERROR:"):].strip()
    return (stderr or "").strip()


def download_audio(job_data: JobData) -> JobResult:
    track_id = job_data['track_id']
    friend_id = job_data['friend_id']
    job_id = job_data.get('job_id', f"{track_id}_{int(time.time())}")
    log_sink: list[str] = []

    if job_data.get("local_audio_url") and not has_download_urls(job_data):
        logger.info("No remote URLs present for job %s; rerouting to local analysis", job_id)
        return analyze_local_audio(job_data)

    logger.info(f"Starting download job {job_id} for track {track_id}")
    update_job_status(job_id, 'processing', 10)

    try:
        download_dir = "/app/downloads"
        final_audio_dir = "/app/audio"
        os.makedirs(download_dir, exist_ok=True)
        os.makedirs(final_audio_dir, exist_ok=True)

        sources = [
            ('apple_music_url', 'gamdl'),
            ('youtube_url', 'yt-dlp'),
            ('soundcloud_url', 'yt-dlp'),
        ]

        downloaded_file = None
        successful_downloader = None
        successful_url_key = None
        for url_key, downloader in sources:
            if not (job_data.get(url_key) or "").strip():
                continue

            url = job_data[url_key]
            logger.info(f"Attempting download with {downloader} from {url_key}: {url}")
            log_sink.append(f"Attempting {downloader} for {url_key}: {url}")
            update_job_status(job_id, 'processing', 30)

            try:
                if downloader == 'gamdl':
                    downloaded_file = download_with_gamdl(url, download_dir, track_id, job_data, log_sink=log_sink)
                elif downloader == 'yt-dlp':
                    downloaded_file = download_with_ytdlp(url, download_dir, track_id, log_sink=log_sink)

                if downloaded_file:
                    successful_downloader = downloader
                    successful_url_key = url_key
                    logger.info(f"Successfully downloaded: {downloaded_file}")
                    break
            except Exception as e:
                logger.warning(f"Download failed with {downloader}: {str(e)}")
                log_sink.append(f"FAILED with {downloader}: {str(e)}")
                continue
            finally:
                append_job_logs(job_id, log_sink)
                log_sink.clear()

        if not downloaded_file:
            available_urls = [f"{k}: {job_data.get(k, 'None')}" for k, _ in sources]
            raise Exception(f"All download methods failed. Available URLs: {available_urls}")

        update_job_status(job_id, 'processing', 60)

        file_ext = os.path.splitext(downloaded_file)[1]
        final_filename = f"{track_id}{file_ext}"
        final_file_path = os.path.join(final_audio_dir, final_filename)
        shutil.move(downloaded_file, final_file_path)
        downloaded_file = final_file_path
        logger.info(f"Moved file to {final_file_path}")

        try:
            audio_filename = os.path.basename(downloaded_file)
            body = PatchApiTracksBody(track_id=track_id, friend_id=friend_id)
            body["local_audio_url"] = audio_filename
            response = patch_api_tracks.sync(client=get_groovenet_client(), body=body)
            if response is None:
                logger.error(f"Failed to update local_audio_url for track {track_id}")
        except Exception as e:
            logger.warning(f"Failed to update local_audio_url: {e}")

        update_job_status(job_id, 'processing', 80)

        analysis_result = None
        analysis_error = None
        try:
            logger.info(f"Starting audio analysis for {downloaded_file}")
            analysis_result = analyze_audio_file(downloaded_file, track_id, friend_id, log_sink=log_sink)
            append_job_logs(job_id, log_sink)
            log_sink.clear()
        except Exception as e:
            analysis_error = str(e)
            logger.warning(f"Audio analysis failed (download still succeeded): {e}")
            log_sink.append(f"Analysis failed (non-fatal): {analysis_error}")
            append_job_logs(job_id, log_sink)
            log_sink.clear()

        update_job_status(job_id, 'processing', 95)

        try:
            cleanup_download_directory(download_dir, track_id)
        except Exception as e:
            logger.warning(f"Download directory cleanup failed (non-critical): {e}")

        result = {
            'success': True,
            'local_audio_url': os.path.basename(downloaded_file),
            'track_id': track_id,
            'friend_id': friend_id,
            'downloader': successful_downloader,
            'source_url_key': successful_url_key,
            'analysis_status': 'failed' if analysis_error else 'ok',
        }
        if analysis_result:
            result['analysis'] = analysis_result
        if analysis_error:
            result['analysis_error'] = analysis_error

        update_job_status(job_id, 'completed', 100, result=result, analysis_error=analysis_error)
        logger.info(f"Job {job_id} completed successfully")
        return result

    except Exception as e:
        error_msg = f"Download failed: {str(e)}"
        logger.error(f"Job {job_id} failed: {error_msg}")
        logger.error(traceback.format_exc())
        log_sink.append(f"ERROR: {error_msg}")
        log_sink.append(traceback.format_exc())
        append_job_logs(job_id, log_sink)
        update_job_status(job_id, 'failed', 0, error=error_msg)
        return {'success': False, 'error': error_msg, 'track_id': track_id, 'friend_id': friend_id}
