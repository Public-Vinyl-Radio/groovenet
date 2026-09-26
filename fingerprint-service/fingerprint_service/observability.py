"""One structured log line per stage of a live window (#280).

The pipeline runs unattended, so when a record plays and nothing shows up the
question is *where* it broke. Every line here is a single JSON object keyed on
`ingest_id` — the same id the app logs — so one chunk can be followed across
the container boundary with a grep.

Fields are an allowlist, not a filter. Anything not named in `ALLOWED_FIELDS`
is dropped, and only scalars survive, so a job payload, a PCM buffer or a
response body cannot reach a log line by being passed in carelessly. Free text
(`error`) is truncated and scrubbed of anything shaped like a credential.
"""
import json
import logging
import re
import sys
import time
from datetime import UTC, datetime

COMPONENT = "fingerprint-service"

#: Where a chunk failed. The app uses the same words for its own stages.
STAGE_PARSE = "parse"
STAGE_RESOLVE = "resolve"
STAGE_DECODE = "decode"
STAGE_MATCH = "match"
STAGE_REPORT = "report"

ALLOWED_FIELDS = frozenset(
    {
        "ingest_id",
        "source_id",
        "session_id",
        "sequence",
        "queue",
        "status",
        "stage",
        "error",
        "captured_at",
        "duration_seconds",
        "declared_duration_seconds",
        "sample_rate",
        "channels",
        "codec",
        "level_dbfs",
        "candidates",
        "track_id",
        "friend_id",
        "confidence",
        "offset_seconds",
        "fingerprint_type",
        "fingerprint_version",
        "queue_wait_ms",
        "decode_ms",
        "match_ms",
        "processing_ms",
    }
)

#: Long enough for an ffmpeg complaint, short enough that a stray body can't
#: turn one line into a megabyte.
MAX_STRING = 300

_REDACTIONS = (
    (re.compile(r"(?i)\bbearer\s+[^\s\"',]+"), "Bearer [redacted]"),
    (
        re.compile(r"(?i)\b(token|password|passwd|secret|api[_-]?key|authorization)(\s*[=:]\s*)[^\s\"',&]+"),
        r"\1\2[redacted]",
    ),
    # Userinfo in a URL: redis://user:pass@host, https://u:p@app
    (re.compile(r"(?i)([a-z][a-z0-9+.-]*://)[^/\s:@]+:[^/\s@]+@"), r"\1[redacted]@"),
)


def redact(text: str) -> str:
    """Scrub credential-shaped substrings and cap the length."""
    for pattern, replacement in _REDACTIONS:
        text = pattern.sub(replacement, text)
    return text if len(text) <= MAX_STRING else text[: MAX_STRING - 1] + "…"


def _scalar(value):
    """The value if it is safe to log as-is, else None to drop it."""
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, int | float):
        return value if value == value and abs(value) != float("inf") else None
    if isinstance(value, str):
        return redact(value)
    # bytes, dicts, lists, audio objects: never.
    return None


def sanitize(fields: dict) -> dict:
    """Keep only allowlisted keys with scalar values."""
    clean = {}
    for key, value in fields.items():
        if key not in ALLOWED_FIELDS:
            continue
        safe = _scalar(value)
        if safe is None and value is not None:
            continue
        clean[key] = safe
    return clean


class _JsonLineFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return record.getMessage()


def _build_event_logger() -> logging.Logger:
    events = logging.getLogger("fingerprint_service.events")
    if not events.handlers:
        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(_JsonLineFormatter())
        events.addHandler(handler)
    events.setLevel(logging.INFO)
    # The root handler would wrap each line in a timestamp prefix, and the
    # point of these lines is that they parse as JSON on their own.
    events.propagate = False
    return events


event_logger = _build_event_logger()


def log_event(event: str, *, level: int = logging.INFO, **fields) -> dict:
    """Emit one JSON line and return what was written, for tests."""
    line = {
        "ts": datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "level": logging.getLevelName(level).lower(),
        "component": COMPONENT,
        "event": event,
        **sanitize(fields),
    }
    event_logger.log(level, json.dumps(line, separators=(",", ":")))
    return line


def elapsed_ms(started: float) -> int:
    """Milliseconds since a `time.monotonic()` reading."""
    return round((time.monotonic() - started) * 1000)


def queue_wait_ms(enqueued_at: str | None, now: float | None = None) -> int | None:
    """How long a job sat in Redis, from the app's `enqueued_at` stamp.

    Clocks on two containers on one host agree closely enough for this; a
    negative result means they do not, and is reported as unknown rather than
    as a job that arrived before it was sent.
    """
    if not enqueued_at:
        return None
    try:
        sent = datetime.fromisoformat(str(enqueued_at).replace("Z", "+00:00"))
    except ValueError:
        return None
    moment = time.time() if now is None else now
    wait = round((moment - sent.timestamp()) * 1000)
    return wait if wait >= 0 else None
