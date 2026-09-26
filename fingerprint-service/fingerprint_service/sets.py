"""Derive a tracklist's raw material from a whole set recording (#282).

The offline sibling of live ingest: the same index and the same matcher, but a
three-hour recording instead of a 15 s chunk, and no Raspberry Pi. What leaves
here is one match per window. Grouping windows into plays and diffing against
a planned playlist is the app's job, with the same grouping code as #279.

The recording is streamed, never held whole: ffmpeg's output feeds Chromaprint
in chunks, and the matcher cuts windows from the finished fingerprint. That is
the #271 recipe — fingerprint once, slice many — at a fraction of the memory.
"""
import os
import time
from collections.abc import Iterable, Iterator

from .audio import BYTES_PER_SAMPLE, AudioDecodeError, stream_pcm
from .chromaprint_engine import FingerprintError
from .config import (
    SAMPLE_RATE,
    SET_DECODE_TIMEOUT,
    SET_RECORDINGS_DIR,
    SET_STEP_SECONDS,
    SET_WINDOW_SECONDS,
    logger,
)
from .matcher import FingerprintMatcher
from .results import build_set_result
from .types import SetJob, SetResult

REQUIRED_FIELDS = ("derivation_id", "file_path")


class InvalidSetJob(ValueError):
    """The payload is not something set derivation can act on."""


def parse_set_job(job: object) -> SetJob:
    """Validate one `fingerprint_set_queue` payload."""
    if not isinstance(job, dict):
        raise InvalidSetJob(f"expected a JSON object, got {type(job).__name__}")

    missing = [field for field in REQUIRED_FIELDS if job.get(field) in (None, "")]
    if missing:
        raise InvalidSetJob(f"missing required field(s): {', '.join(missing)}")

    return job


def window_settings(job: SetJob) -> tuple[float, float]:
    """The job's window and step, or the defaults, refusing nonsense."""
    settings = []
    for field, default in (("window_seconds", SET_WINDOW_SECONDS), ("step_seconds", SET_STEP_SECONDS)):
        raw = job.get(field)
        try:
            value = default if raw is None else float(raw)
        except (TypeError, ValueError):
            raise InvalidSetJob(f"{field} must be a number, got {raw!r}") from None
        if value <= 0:
            raise InvalidSetJob(f"{field} must be positive, got {value}")
        settings.append(value)
    return settings[0], settings[1]


def resolve_recording_path(file_path: str) -> str:
    """Absolute path to a recording, confined to the set recordings volume.

    Same rule as the ingest and audio volumes: a queue payload is not a licence
    to read an arbitrary file.
    """
    root = os.path.realpath(SET_RECORDINGS_DIR)
    candidate = os.path.realpath(os.path.join(root, file_path))
    if candidate != root and not candidate.startswith(root + os.sep):
        raise InvalidSetJob(f"{file_path} resolves outside {SET_RECORDINGS_DIR}")
    return candidate


class _Counted:
    """Passes chunks through, counting bytes, so the duration comes for free."""

    def __init__(self, chunks: Iterable[bytes]) -> None:
        self._chunks = chunks
        self.bytes = 0

    def __iter__(self) -> Iterator[bytes]:
        for chunk in self._chunks:
            self.bytes += len(chunk)
            yield chunk


def derive(job: SetJob, matcher: FingerprintMatcher) -> SetResult:
    """Decode, fingerprint and match one recording, building the result.

    A recording that cannot be decoded or fingerprinted is a *reported*
    failure: the app has a derivation row waiting on a terminal state.
    """
    window_seconds, step_seconds = window_settings(job)
    path = resolve_recording_path(str(job["file_path"]))

    started = time.monotonic()
    pcm = _Counted(stream_pcm(path, SAMPLE_RATE, timeout=SET_DECODE_TIMEOUT))
    try:
        windows = matcher.match_recording(
            pcm,
            SAMPLE_RATE,
            window_seconds=window_seconds,
            step_seconds=step_seconds,
        )
    except (AudioDecodeError, FingerprintError) as e:
        logger.error("Set %s could not be derived: %s", job["derivation_id"], e)
        return build_set_result(
            job, matcher, window_seconds=window_seconds, step_seconds=step_seconds, error=str(e)
        )

    duration = pcm.bytes / BYTES_PER_SAMPLE / SAMPLE_RATE
    logger.info(
        "Derived set %s: %d window(s) over %.0fs of audio in %.1fs",
        job["derivation_id"],
        len(windows),
        duration,
        time.monotonic() - started,
    )
    return build_set_result(
        job,
        matcher,
        window_seconds=window_seconds,
        step_seconds=step_seconds,
        windows=windows,
        duration_seconds=round(duration, 2),
        sample_rate=SAMPLE_RATE,
    )
