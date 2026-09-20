"""Report what happened with a chunk back to the app.

Same direction as `download-worker`: the Python side does the work and the app
owns the database. It posts with `requests` rather than `groovenet_client`
because the callback route does not exist in the OpenAPI spec yet (#276) —
switch to the generated client once it does.
"""
import requests

from .config import APP_URL, RESULT_TIMEOUT, logger
from .matcher import FingerprintMatcher
from .types import IngestJob, IngestResult, MatchCandidate

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
