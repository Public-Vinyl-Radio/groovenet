"""Report what happened with a chunk back to the app.

Same direction as `download-worker`: the Python side does the work and the app
owns the database. It posts with `requests` rather than `groovenet_client`
because the callback route does not exist in the OpenAPI spec yet (#276) —
switch to the generated client once it does.
"""
import requests

from .config import APP_URL, RESULT_TIMEOUT, logger
from .matcher import FingerprintMatcher
from .types import (
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
    error: str | None = None,
) -> IngestResult:
    """Assemble the callback body for one chunk.

    An `error` makes it a failed ingest; absent, it is processed — including
    when `candidates` is empty, which is a recorded no-match window and not a
    failure.
    """
    return {
        "ingest_id": str(job.get("ingest_id", "")),
        "source_id": str(job.get("source_id", "")),
        "session_id": job.get("session_id"),
        "sequence": job.get("sequence"),
        "status": STATUS_FAILED if error else STATUS_PROCESSED,
        "error": error,
        # The detection window starts when the listener captured it, not when
        # we got round to it, so #279 can order windows across a queue backlog.
        "window_start_at": job.get("captured_at"),
        "duration_seconds": duration_seconds,
        "sample_rate": sample_rate,
        "fingerprint_type": matcher.fingerprint_type,
        "fingerprint_version": matcher.fingerprint_version,
        "candidates": list(candidates or []),
    }


def report_result(result: IngestResult) -> None:
    """POST one result, raising on anything the app did not accept."""
    url = result_url(result["ingest_id"])
    try:
        response = requests.post(url, json=result, timeout=RESULT_TIMEOUT)
    except requests.RequestException as e:
        raise ResultReportError(f"Could not reach {url}: {e}") from e

    if not response.ok:
        raise ResultReportError(
            f"{url} returned {response.status_code}: {response.text[:500]}"
        )

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
        logger.error("Failed to report ingest %s: %s", result["ingest_id"], e)
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
        response = requests.post(claim_url(ingest_id), timeout=RESULT_TIMEOUT)
    except requests.RequestException as e:
        logger.warning("Could not claim ingest %s: %s", ingest_id, e)
        return False

    if not response.ok:
        logger.warning(
            "Claim for ingest %s returned %s", ingest_id, response.status_code
        )
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
        response = requests.post(url, json=result, timeout=RESULT_TIMEOUT)
    except requests.RequestException as e:
        raise ResultReportError(f"Could not reach {url}: {e}") from e

    if not response.ok:
        raise ResultReportError(
            f"{url} returned {response.status_code}: {response.text[:500]}"
        )

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
        response = requests.post(set_claim_url(derivation_id), timeout=RESULT_TIMEOUT)
    except requests.RequestException as e:
        logger.warning("Could not claim set %s: %s", derivation_id, e)
        return False

    if not response.ok:
        logger.warning(
            "Claim for set %s returned %s", derivation_id, response.status_code
        )
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
        response = requests.post(url, json=upsert, timeout=RESULT_TIMEOUT)
    except requests.RequestException as e:
        raise ResultReportError(f"Could not reach {url}: {e}") from e

    if not response.ok:
        raise ResultReportError(
            f"{url} returned {response.status_code}: {response.text[:500]}"
        )

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
