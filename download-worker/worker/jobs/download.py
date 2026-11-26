import asyncio
import os
import shutil
import subprocess
import time
import traceback
from collections.abc import Callable
from contextlib import AsyncExitStack
from dataclasses import dataclass

from gamdl.api import (
    AppleMusicApi,
    GamdlApiResponseError,
    GamdlAuthenticationError,
    GamdlRateLimitError,
    WrapperApi,
)
from gamdl.download import Downloader, PathFormatter
from gamdl.drm import Drm, DrmConfigurationError, DrmLicenseError
from gamdl.exceptions import GamdlError
from gamdl.media import MediaResolver, SongCodec
from gamdl.media.exceptions import MediaNotFoundError, MediaNotStreamableError, UnsupportedMediaError
from gamdl.media.url import AppleMusicUrlInfo

from ..audio_utils import cleanup_download_directory
from ..config import logger
from ..lossless import convert_alac_to_flac
from ..observability import capture_exception
from ..redis_utils import append_job_logs, enqueue_analyze_job, update_job_status
from ..subprocess_utils import run_subprocess
from ..track_api import get_groovenet_client, report_job_outcome
from ..types import JobData, JobResult
from .analyze import analyze_local_audio


def resolve_gamdl_cookie_file() -> str | None:
    configured_path = os.getenv("GAMDL_COOKIE_FILE")
    candidates: list[str] = []

    if configured_path:
        candidates.append(configured_path)

    # Backwards-compatible fallbacks for older local setups.
    candidates.extend(
        [
            "/app/cookies/gamdl_cookies.txt",
            "/app/cookies/music.apple.com_cookies.txt",
        ]
    )

    seen: set[str] = set()
    for path in candidates:
        if not path or path in seen:
            continue
        seen.add(path)
        if os.path.exists(path):
            return path

    return configured_path


# gamdl picks a stream per track from a codec priority list. Its default, HLS
# `aac`, is the same 256 kbps AAC that 3.x called aac-web. ALAC is decrypted
# from a Wrapper v2 1.0.0 session (#1147), so lossless is requested only when
# one is configured; every other setting gets the default.
DEFAULT_CODEC_PRIORITY = ("aac",)
LOSSLESS_CODEC_PRIORITY = ("alac-lossless", "aac")

GAMDL_TIMEOUT_SECONDS = 600
AUDIO_EXTENSIONS = (".m4a", ".mp3", ".aac", ".flac")


def gamdl_wrapper_url() -> str | None:
    """The Wrapper v2 base URL from GAMDL_WRAPPER_URL, or None when unset."""
    return (os.getenv("GAMDL_WRAPPER_URL") or "").strip() or None


def gamdl_codec_priority(quality: str) -> tuple[str, ...]:
    """Map the gamdl_settings audio_quality value onto a gamdl codec priority."""
    if quality != "lossless":
        return DEFAULT_CODEC_PRIORITY

    if not gamdl_wrapper_url():
        logger.warning("Lossless requested but GAMDL_WRAPPER_URL is not set; downloading AAC")
        return DEFAULT_CODEC_PRIORITY

    return LOSSLESS_CODEC_PRIORITY


def usable_gamdl_cookie_file() -> str | None:
    """The resolved cookie file when it holds Apple entries, else None (with a warning)."""
    cookie_file = resolve_gamdl_cookie_file()
    if not cookie_file:
        logger.info("No cookie file specified")
        return None
    if not os.path.exists(cookie_file):
        logger.warning(f"Cookie file not found: {cookie_file}")
        return None
    try:
        with open(cookie_file) as f:
            content = f.read().strip()
    except Exception as e:
        logger.warning(f"Could not validate cookie file: {e}")
        return None
    if not content:
        logger.warning("Cookie file is empty")
        return None
    if "apple" not in content.lower():
        logger.warning("Cookie file may not contain Apple Music cookies")
        return None

    apple_lines = [line for line in content.split("\n") if "apple" in line.lower()]
    logger.info(f"Using gamdl cookie file: {cookie_file}")
    logger.info(f"Using cookie file with {len(apple_lines)} Apple entries")
    return cookie_file


class WrapperSignInRequired(Exception):
    """The wrapper asked for an Apple ID login, which a worker cannot answer."""


async def _wrapper_sign_in_required(*_args: object) -> str:
    raise WrapperSignInRequired("Wrapper v2 is signed out - sign in to the wrapper, then retry")


@dataclass(frozen=True)
class GamdlOutcome:
    """One track gamdl published or found already on disk."""

    media_id: str
    status: str  # downloaded | overwritten | skipped (already exists)
    path: str
    catalog_id: str | None = None
    album_ids: tuple[str, ...] = ()


def describe_gamdl_error(error: Exception, subscription_confirmed: bool = True) -> str:
    """The message the app shows for a gamdl failure, by exception type."""
    if isinstance(error, WrapperSignInRequired):
        return str(error)
    if isinstance(error, GamdlAuthenticationError):
        return "Authentication failed - cookie file may be expired or invalid"
    if isinstance(error, GamdlRateLimitError):
        return "Rate limited by Apple Music - please try again later"
    if isinstance(error, MediaNotFoundError):
        return "Track not found on Apple Music"
    if isinstance(error, GamdlApiResponseError) and error.status_code == 404:
        return "Track not found on Apple Music"
    if isinstance(error, UnsupportedMediaError):
        return f"Unsupported Apple Music URL: {error}"
    if not subscription_confirmed and isinstance(error, (MediaNotStreamableError, DrmLicenseError)):
        return "Apple Music subscription required"
    if isinstance(error, MediaNotStreamableError):
        return "Track not available in your region"
    if isinstance(error, DrmConfigurationError):
        return f"Decryption backend unavailable: {error}"
    return f"gamdl failed: {type(error).__name__}: {error}"


async def _open_apple_music(
    stack: AsyncExitStack, cookie_file: str | None, wrapper_url: str | None
) -> tuple[AppleMusicApi, WrapperApi | None]:
    if wrapper_url:
        wrapper = await stack.enter_async_context(
            await WrapperApi.create(
                base_url=wrapper_url,
                get_credentials=_wrapper_sign_in_required,
                get_2fa_code=_wrapper_sign_in_required,
            )
        )
        api = await stack.enter_async_context(await AppleMusicApi.from_wrapper(wrapper))
        return api, wrapper
    api = await stack.enter_async_context(await AppleMusicApi.from_cookies(cookie_file))
    return api, None


async def _catalog_ids(media: object) -> tuple[str | None, tuple[str, ...]]:
    """The song and album IDs Apple's catalog returned, for the URL-mismatch guard."""
    try:
        metadata = await media.get_metadata()
    except GamdlError:
        return None, ()
    albums = metadata.get("relationships", {}).get("albums", {}).get("data", [])
    return metadata.get("id"), tuple(a["id"] for a in albums if a.get("id"))


async def run_gamdl(
    url: str,
    output_dir: str,
    codec_priority: tuple[str, ...],
    *,
    cookie_file: str | None,
    wrapper_url: str | None,
    log: Callable[[str], None],
) -> list[GamdlOutcome]:
    """Download every track `url` resolves to through gamdl's Python API.

    Like `gamdl rip`, a track the storefront cannot play is skipped so the rest
    of an album still downloads; any other error stops the run (fail-fast). If
    nothing was published, the first skip reason is raised instead.
    """
    outcomes: list[GamdlOutcome] = []
    skips: list[Exception] = []
    subscription_confirmed = True
    try:
        async with AsyncExitStack() as stack:
            api, wrapper = await _open_apple_music(stack, cookie_file, wrapper_url)
            subscription_confirmed = api.active_subscription
            if not subscription_confirmed:
                log("Apple Music subscription was not confirmed for this account")
            downloader = Downloader(
                drm=Drm.from_widevine(api),
                wrapper_api=wrapper,
                path_formatter=PathFormatter(output_dir),
            )
            codecs = [SongCodec(codec) for codec in codec_priority]
            async for media in MediaResolver(api).from_url(url):
                try:
                    result = await downloader.download(media, codec_priority=codecs)
                except (MediaNotFoundError, MediaNotStreamableError) as e:
                    log(f"gamdl skipped {media.id}: {e}")
                    skips.append(e)
                    continue
                catalog_id, album_ids = await _catalog_ids(media)
                path = str(result.path)
                if result.codec in (SongCodec.ALAC_LOSSLESS, SongCodec.ALAC_HIRES) or (
                    wrapper_url and result.codec is None
                ):
                    path = convert_alac_to_flac(path)
                outcome = GamdlOutcome(result.media_id, result.status.value, path, catalog_id, album_ids)
                codec = result.codec.value if result.codec else "existing file"
                log(f"gamdl {outcome.status} {outcome.media_id} ({codec}): {outcome.path}")
                outcomes.append(outcome)
    except Exception as e:
        raise Exception(describe_gamdl_error(e, subscription_confirmed)) from e

    if not outcomes and skips:
        raise Exception(describe_gamdl_error(skips[0], subscription_confirmed)) from skips[0]
    return outcomes


def expected_apple_music_ids(url: str) -> tuple[str | None, str | None]:
    """The (song, album) IDs a URL names; either is None when it names none."""
    try:
        info = AppleMusicUrlInfo.parse(url)
    except UnsupportedMediaError:
        return None, None
    if info.sub_id:
        return info.sub_id, info.media_id if info.kind == "album" else None
    if info.kind == "song":
        return info.media_id, None
    return None, None


def check_url_mismatch(url: str, outcomes: list[GamdlOutcome], log: Callable[[str], None]) -> None:
    """Log loudly when Apple's catalog served a different song or album than the URL names."""
    song_id, album_id = expected_apple_music_ids(url)
    if not song_id:
        return
    for outcome in outcomes:
        served_song = outcome.catalog_id or outcome.media_id
        if served_song != song_id:
            message = f"URL MISMATCH: Expected {url}, gamdl processed song {served_song}"
        elif album_id and outcome.album_ids and album_id not in outcome.album_ids:
            message = (
                f"URL MISMATCH: Expected {url}, gamdl processed song {served_song} "
                f"from album {', '.join(outcome.album_ids)}"
            )
        else:
            continue
        logger.error(message)
        log(message)


def _non_empty_audio_file(path: str) -> bool:
    return path.endswith(AUDIO_EXTENSIONS) and os.path.isfile(path) and os.path.getsize(path) > 0


def _find_audio_files(search_path: str, found: list[str], max_depth: int = 3, current_depth: int = 0) -> None:
    if current_depth > max_depth:
        return
    try:
        for item in os.listdir(search_path):
            item_path = os.path.join(search_path, item)
            if os.path.isfile(item_path):
                if _non_empty_audio_file(item_path):
                    found.append(item_path)
            elif os.path.isdir(item_path) and current_depth < max_depth:
                _find_audio_files(item_path, found, max_depth, current_depth + 1)
    except Exception as e:
        logger.warning(f"Error searching {search_path}: {e}")


def _audio_files_since(output_dir: str, before_files: set) -> list[str]:
    """Audio files new in output_dir since before_files, or every one when none are new."""
    after_files: set = set()
    try:
        after_files = set(os.listdir(output_dir))
    except Exception:
        pass

    new_items = after_files - before_files
    downloaded_files: list[str] = []
    if not new_items:
        logger.info("No new items detected, searching entire directory for audio files")
        _find_audio_files(output_dir, downloaded_files)
    for item in new_items:
        item_path = os.path.join(output_dir, item)
        if os.path.isdir(item_path):
            _find_audio_files(item_path, downloaded_files)
        elif _non_empty_audio_file(item_path):
            downloaded_files.append(item_path)

    if not downloaded_files:
        logger.error(f"No audio files found. New items: {new_items}")
    return downloaded_files


def has_download_urls(job_data: JobData) -> bool:
    for key in ["apple_music_url", "youtube_url", "soundcloud_url"]:
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
    def log(message: str) -> None:
        logger.info(message)
        if log_sink is not None:
            log_sink.append(message)

    try:
        quality = "best"
        if job_data and "quality" in job_data:
            quality = job_data["quality"]

        codec_priority = gamdl_codec_priority(quality)
        # The wrapper signs in for ALAC only; AAC keeps using the cookie file,
        # so a broken wrapper never stops the default path.
        wrapper_url = gamdl_wrapper_url() if codec_priority == LOSSLESS_CODEC_PRIORITY else None
        cookie_file = None
        if wrapper_url is None:
            cookie_file = usable_gamdl_cookie_file()
            if cookie_file is None:
                raise Exception("Authentication failed - no usable Apple Music cookie file")

        before_files: set = set()
        try:
            before_files = set(os.listdir(output_dir))
        except Exception:
            pass

        log(f"gamdl {url} (codecs: {','.join(codec_priority)}, auth: {'wrapper' if wrapper_url else 'cookies'})")
        outcomes = asyncio.run(
            asyncio.wait_for(
                run_gamdl(
                    url,
                    output_dir,
                    codec_priority,
                    cookie_file=cookie_file,
                    wrapper_url=wrapper_url,
                    log=log,
                ),
                GAMDL_TIMEOUT_SECONDS,
            )
        )
        check_url_mismatch(url, outcomes, log)

        # Handle "already exists": gamdl skipped a file it had published before.
        for outcome in outcomes:
            if outcome.status != "skipped" or not _non_empty_audio_file(outcome.path):
                continue
            logger.info(f"gamdl found existing file: {outcome.path}")
            new_filepath = os.path.join(output_dir, f"{track_id}{os.path.splitext(outcome.path)[1]}")
            try:
                shutil.copy2(outcome.path, new_filepath)
                return new_filepath
            except Exception as e:
                logger.warning(f"Could not copy file: {e}, using original path")
                return outcome.path

        downloaded_files = [o.path for o in outcomes if o.status != "skipped" and _non_empty_audio_file(o.path)]
        if not downloaded_files:
            downloaded_files = _audio_files_since(output_dir, before_files)
        if not downloaded_files:
            raise Exception(f"Downloaded file not found for track_id {track_id}")

        return max(downloaded_files, key=os.path.getsize)

    except TimeoutError:
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
                "args": [
                    "yt-dlp",
                    "--extractor-args",
                    "youtube:player_client=android",
                    "-f",
                    "bestaudio[ext=m4a]/bestaudio/best",
                    "-x",
                    "--audio-format",
                    "m4a",
                    "--no-playlist",
                    "--output",
                    output_template,
                    url,
                ],
                "name": "Android client",
            },
            {
                "args": [
                    "yt-dlp",
                    "--extractor-args",
                    "youtube:player_client=ios",
                    "-f",
                    "bestaudio/best",
                    "-x",
                    "--audio-format",
                    "m4a",
                    "--no-playlist",
                    "--output",
                    output_template,
                    url,
                ],
                "name": "iOS client",
            },
            {
                "args": [
                    "yt-dlp",
                    "--extractor-args",
                    "youtube:player_client=web",
                    "-f",
                    "ba/b",
                    "-x",
                    "--audio-format",
                    "m4a",
                    "--output",
                    output_template,
                    url,
                ],
                "name": "Web client",
            },
            {
                "args": [
                    "yt-dlp",
                    "-f",
                    "bestaudio/best",
                    "-x",
                    "--audio-format",
                    "m4a",
                    "--output",
                    output_template,
                    url,
                ],
                "name": "Default extraction",
            },
        ]

        last_error = None
        for i, strategy in enumerate(strategies, 1):
            logger.info(f"Trying strategy {i}/{len(strategies)}: {strategy['name']}")
            try:
                result = run_subprocess(strategy["args"], timeout=300, log_sink=log_sink)
                if result.returncode == 0:
                    for file in os.listdir(output_dir):
                        if file.startswith(track_id) and (file.endswith(".m4a") or file.endswith(".mp3")):
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
            return stripped[len("ERROR:") :].strip()
    return (stderr or "").strip()


def download_audio(job_data: JobData) -> JobResult:
    track_id = job_data["track_id"]
    friend_id = job_data["friend_id"]
    job_id = job_data.get("job_id", f"{track_id}_{int(time.time())}")
    log_sink: list[str] = []

    if job_data.get("local_audio_url") and not has_download_urls(job_data):
        logger.info("No remote URLs present for job %s; rerouting to local analysis", job_id)
        return analyze_local_audio(job_data)

    logger.info(f"Starting download job {job_id} for track {track_id}")
    update_job_status(job_id, "processing", 10)

    try:
        download_dir = "/app/downloads"
        final_audio_dir = "/app/audio"
        os.makedirs(download_dir, exist_ok=True)
        os.makedirs(final_audio_dir, exist_ok=True)

        sources = [
            ("apple_music_url", "gamdl"),
            ("youtube_url", "yt-dlp"),
            ("soundcloud_url", "yt-dlp"),
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
            update_job_status(job_id, "processing", 30)

            try:
                if downloader == "gamdl":
                    downloaded_file = download_with_gamdl(url, download_dir, track_id, job_data, log_sink=log_sink)
                elif downloader == "yt-dlp":
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

        update_job_status(job_id, "processing", 60)

        file_ext = os.path.splitext(downloaded_file)[1]
        final_filename = f"{track_id}{file_ext}"
        final_file_path = os.path.join(final_audio_dir, final_filename)
        shutil.move(downloaded_file, final_file_path)
        downloaded_file = final_file_path
        logger.info(f"Moved file to {final_file_path}")

        try:
            audio_filename = os.path.basename(downloaded_file)
            get_groovenet_client().update_track(
                {
                    "track_id": track_id,
                    "friend_id": friend_id,
                    "local_audio_url": audio_filename,
                    "audio_source": successful_url_key.removesuffix("_url"),
                }
            )
        except Exception as e:
            logger.warning(f"Failed to update local_audio_url: {e}")

        update_job_status(job_id, "processing", 80)

        # Analysis runs as its own analyze-local job so a failure there is
        # captured and marked failed on that job instead of being swallowed here.
        analysis_job_id = None
        try:
            analysis_job_id = enqueue_analyze_job(track_id, friend_id, os.path.basename(downloaded_file))
            log_sink.append(f"Queued analysis job {analysis_job_id}")
        except Exception as e:
            capture_exception(e)
            logger.error(f"Failed to enqueue analysis for job {job_id}: {e}")
            log_sink.append(f"ERROR: Failed to enqueue analysis job: {e}")
        append_job_logs(job_id, log_sink)
        log_sink.clear()
        analysis_enqueue_error = None if analysis_job_id else "Failed to enqueue analysis job"

        update_job_status(job_id, "processing", 95)

        try:
            cleanup_download_directory(download_dir, track_id)
        except Exception as e:
            logger.warning(f"Download directory cleanup failed (non-critical): {e}")

        result = {
            "success": True,
            "local_audio_url": os.path.basename(downloaded_file),
            "track_id": track_id,
            "friend_id": friend_id,
            "downloader": successful_downloader,
            "source_url_key": successful_url_key,
            "analysis_status": "failed" if analysis_enqueue_error else "queued",
        }
        if analysis_job_id:
            result["analysis_job_id"] = analysis_job_id
        if analysis_enqueue_error:
            result["analysis_error"] = analysis_enqueue_error

        update_job_status(job_id, "completed", 100, result=result, analysis_error=analysis_enqueue_error)
        report_job_outcome(job_id)
        logger.info(f"Job {job_id} completed successfully")
        return result

    except Exception as e:
        capture_exception(e)
        error_msg = f"Download failed: {str(e)}"
        logger.error(f"Job {job_id} failed: {error_msg}")
        logger.error(traceback.format_exc())
        log_sink.append(f"ERROR: {error_msg}")
        log_sink.append(traceback.format_exc())
        append_job_logs(job_id, log_sink)
        update_job_status(job_id, "failed", 0, error=error_msg)
        report_job_outcome(job_id)
        return {"success": False, "error": error_msg, "track_id": track_id, "friend_id": friend_id}
