"""Report results through the shared app client; delivery policy stays here."""

import logging

import requests
from groovenet_client import GroovenetApiError

from .app_api import get_groovenet_client
from .config import APP_URL, RESULT_TIMEOUT, logger
from .matcher import FingerprintMatcher
from .observability import STAGE_REPORT, log_event
from .types import (
    FileStats,
    FingerprintUpsert,
    IngestJob,
    IngestResult,
    MatchCandidate,
    SetJob,
    SetResult,
    WindowMatch,
)

STATUS_PROCESSED = "processed"
STATUS_FAILED = "failed"


class ResultReportError(RuntimeError):
    """The app would not accept the result."""


def result_url(ingest_id: str) -> str:
    return f"{APP_URL.rstrip('/')}/api/audio/ingest/{ingest_id}/result"


def build_result(
    job: IngestJob,
    matcher: FingerprintMatcher,
    *,
    candidates: list[MatchCandidate] | None = None,
    duration_seconds: float | None = None,
    sample_rate: int | None = None,
    level_dbfs: float | None = None,
    error: str | None = None,
    error_stage: str | None = None,
) -> IngestResult:
    """Assemble the callback body for one chunk.

    An `error` makes it a failed ingest; absent, it is processed — including
    when `candidates` is empty, which is a recorded no-match window and not a
    failure. `error_stage` names where it failed (#280), so the app's terminal
    log line says which half of the pipeline to look at.
    """
    return {
        "ingest_id": str(job.get("ingest_id", "")),
        "source_id": str(job.get("source_id", "")),
        "session_id": job.get("session_id"),
        "sequence": job.get("sequence"),
        "status": STATUS_FAILED if error else STATUS_PROCESSED,
        "error": error,
        "error_stage": error_stage if error else None,
        # The detection window starts when the listener captured it, not when
        # we got round to it, so #279 can order windows across a queue backlog.
        "window_start_at": job.get("captured_at"),
        "duration_seconds": duration_seconds,
        "sample_rate": sample_rate,
        # How loud the window was (#282 follow-up): what a silence floor
        # is tuned from. None when the chunk could not be decoded.
        "level_dbfs": level_dbfs,
        "fingerprint_type": matcher.fingerprint_type,
        "fingerprint_version": matcher.fingerprint_version,
        "candidates": list(candidates or []),
    }


def report_result(result: IngestResult) -> None:
    """POST one result, raising on anything the app did not accept."""
    url = result_url(result["ingest_id"])
    try:
        get_groovenet_client(APP_URL, RESULT_TIMEOUT).report_ingest_result(result["ingest_id"], result)
    except requests.RequestException as e:
        raise ResultReportError(f"Could not reach {url}: {e}") from e
    except GroovenetApiError as e:
        raise ResultReportError(f"{url} returned {e.status}: {e.message}") from e

    logger.info(
        "Reported ingest %s as %s with %d candidate(s)",
        result["ingest_id"],
        result["status"],
        len(result["candidates"]),
    )


def try_report_result(result: IngestResult) -> bool:
    """Report a result, logging rather than raising if the app is unreachable.

    A chunk whose result cannot be delivered is already lost — the app's
    stale-`processing` reaper (#276) will mark it failed and sweep the file.
    Raising here would only cost the next chunk in the queue.
    """
    try:
        report_result(result)
        return True
    except ResultReportError as e:
        log_event(
            "ingest.report_failed",
            level=logging.ERROR,
            ingest_id=result["ingest_id"],
            source_id=result["source_id"],
            status=result["status"],
            stage=STAGE_REPORT,
            error=str(e),
        )
        return False


def claim_url(ingest_id: str) -> str:
    return f"{APP_URL.rstrip('/')}/api/audio/ingest/{ingest_id}/claim"


def try_claim_ingest(ingest_id: str) -> bool:
    """Tell the app this chunk has been picked up (#276).

    Best-effort on purpose. The claim only exists so the app can tell a chunk
    nothing ever collected from one a worker took and died on; losing it costs
    diagnosis, not the result, and refusing to work because the app was briefly
    unreachable would be the worse trade.
    """
    try:
        get_groovenet_client(APP_URL, RESULT_TIMEOUT).claim_ingest(ingest_id)
    except requests.RequestException as e:
        logger.warning("Could not claim ingest %s: %s", ingest_id, e)
        return False
    except GroovenetApiError as e:
        logger.warning("Claim for ingest %s returned %s: %s", ingest_id, e.status, e.message)
        return False
    return True


def set_result_url(derivation_id: str) -> str:
    return f"{APP_URL.rstrip('/')}/api/set-derivations/{derivation_id}/result"


def set_claim_url(derivation_id: str) -> str:
    return f"{APP_URL.rstrip('/')}/api/set-derivations/{derivation_id}/claim"


def build_set_result(
    job: SetJob,
    matcher: FingerprintMatcher,
    *,
    window_seconds: float,
    step_seconds: float,
    windows: list[WindowMatch] | None = None,
    duration_seconds: float | None = None,
    sample_rate: int | None = None,
    error: str | None = None,
) -> SetResult:
    """Assemble the callback body for one set derivation (#282).

    Same rule as a chunk: an `error` makes it failed, and a recording where
    nothing matched is still processed — every window unidentified is an
    answer, usually "these records are not in the library".
    """
    return {
        "derivation_id": str(job.get("derivation_id", "")),
        "status": STATUS_FAILED if error else STATUS_PROCESSED,
        "error": error,
        "fingerprint_type": matcher.fingerprint_type,
        "fingerprint_version": matcher.fingerprint_version,
        "sample_rate": sample_rate,
        "duration_seconds": duration_seconds,
        "window_seconds": window_seconds,
        "step_seconds": step_seconds,
        "windows": list(windows or []),
    }


def report_set_result(result: SetResult) -> None:
    """POST one set result, raising on anything the app did not accept."""
    url = set_result_url(result["derivation_id"])
    try:
        get_groovenet_client(APP_URL, RESULT_TIMEOUT).report_set_result(result["derivation_id"], result)
    except requests.RequestException as e:
        raise ResultReportError(f"Could not reach {url}: {e}") from e
    except GroovenetApiError as e:
        raise ResultReportError(f"{url} returned {e.status}: {e.message}") from e

    logger.info(
        "Reported set %s as %s with %d window(s)",
        result["derivation_id"],
        result["status"],
        len(result["windows"]),
    )


def try_report_set_result(result: SetResult) -> bool:
    """Report a set result, logging rather than raising if the app is down.

    A lost result costs a re-run, not data: the recording is still on its
    volume, and derivation is deterministic.
    """
    try:
        report_set_result(result)
        return True
    except ResultReportError as e:
        logger.error("Failed to report set %s: %s", result["derivation_id"], e)
        return False


def try_claim_set(derivation_id: str) -> bool:
    """Tell the app this derivation has been picked up. Best-effort, like ingest."""
    try:
        get_groovenet_client(APP_URL, RESULT_TIMEOUT).claim_set_derivation(derivation_id)
    except requests.RequestException as e:
        logger.warning("Could not claim set %s: %s", derivation_id, e)
        return False
    except GroovenetApiError as e:
        logger.warning("Claim for set %s returned %s: %s", derivation_id, e.status, e.message)
        return False
    return True


def fingerprint_url() -> str:
    return f"{APP_URL.rstrip('/')}/api/fingerprints"


def persist_fingerprint(upsert: FingerprintUpsert) -> None:
    """POST one reference fingerprint for the app to store (#277).

    Same division of labour as the ingest callback: this service does the CPU
    work and the app owns the database. The route upserts on
    (track_id, friend_id, fingerprint_type, fingerprint_version), so re-running
    an index cannot produce a duplicate row.
    """
    url = fingerprint_url()
    try:
        get_groovenet_client(APP_URL, RESULT_TIMEOUT).upsert_fingerprint(upsert)
    except requests.RequestException as e:
        raise ResultReportError(f"Could not reach {url}: {e}") from e
    except GroovenetApiError as e:
        raise ResultReportError(f"{url} returned {e.status}: {e.message}") from e

    logger.info(
        "Persisted fingerprint for track %s under %s %s",
        upsert["track_id"],
        upsert["fingerprint_type"],
        upsert["fingerprint_version"],
    )


def try_persist_fingerprint(upsert: FingerprintUpsert) -> bool:
    """Persist a fingerprint, turning an unreachable app into a failed track.

    Unlike the ingest callback there is nothing waiting on this and nothing to
    reap: an unpersisted fingerprint simply is not in the index, and the next
    run will generate it again because the stored hash is still missing. So the
    honest thing is to count the track as failed and carry on.
    """
    try:
        persist_fingerprint(upsert)
        return True
    except ResultReportError as e:
        logger.error("Failed to persist fingerprint for track %s: %s", upsert["track_id"], e)
        return False


def try_record_file_stats(stats: FileStats) -> bool:
    """Record an unchanged file's size and mtime (#303), logging on failure.

    Losing this costs one hash on the next check and nothing else — the
    fingerprint is still right — so it never fails the track.
    """
    try:
        get_groovenet_client(APP_URL, RESULT_TIMEOUT).record_file_stats(stats)
    except requests.RequestException as e:
        logger.warning("Could not record file stats for track %s: %s", stats["track_id"], e)
        return False
    except GroovenetApiError as e:
        logger.warning("Recording file stats for track %s returned %s: %s", stats["track_id"], e.status, e.message)
        return False
    return True
