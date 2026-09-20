from typing import NotRequired, TypedDict


class IngestJob(TypedDict):
    """One `fingerprint_queue` payload, as the app enqueues it (#276).

    `ingest_id`, `source_id` and `file_path` are required; everything else is
    what the ingest route's ffprobe inspection happened to learn (#275) and may
    legitimately be absent.
    """

    ingest_id: str
    source_id: str
    file_path: str
    session_id: NotRequired[str | None]
    sequence: NotRequired[int | None]
    captured_at: NotRequired[str | None]
    duration_seconds: NotRequired[float | None]
    sample_rate: NotRequired[int | None]
    channels: NotRequired[int | None]
    codec: NotRequired[str | None]


class MatchCandidate(TypedDict):
    """What the matcher believes this window is.

    A list of these, not a single value: the list is only ever one entry long
    today, but keeping it list-shaped means overlapping-track detection can be
    picked up later without a signature change (#278).
    """

    track_id: str
    friend_id: int
    confidence: float
    offset_seconds: float


class IngestResult(TypedDict):
    """The body posted back to the app's ingest callback.

    Carries both halves of what the app needs: the lifecycle transition for
    `audio_ingests` (#276) and the per-window rows for `play_detections` (#274),
    including the no-match case where `candidates` is empty.
    """

    ingest_id: str
    source_id: str
    session_id: str | None
    sequence: int | None
    status: str
    error: str | None
    window_start_at: str | None
    duration_seconds: float | None
    sample_rate: int | None
    fingerprint_type: str
    fingerprint_version: str
    candidates: list[MatchCandidate]
