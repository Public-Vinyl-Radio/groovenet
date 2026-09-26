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


class WindowMatch(TypedDict):
    """One window of a set recording and what it matched (#282).

    `start_seconds` is from the start of the recording. An empty `candidates`
    is a window heard and not recognised — kept, not dropped, because the app
    reports unidentified stretches rather than hiding them.
    """

    start_seconds: float
    duration_seconds: float
    candidates: list[MatchCandidate]


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


class SetJob(TypedDict):
    """One `fingerprint_set_queue` payload: derive a tracklist from a set (#282).

    `file_path` is relative to SET_RECORDINGS_DIR. Window and step default to
    #271's 15 s / 15 s and are carried back in the result, so a stored
    derivation always says how it was cut.
    """

    derivation_id: str
    file_path: str
    window_seconds: NotRequired[float | None]
    step_seconds: NotRequired[float | None]


class SetResult(TypedDict):
    """The body posted back to the app for one set derivation (#282).

    Raw per-window matches only. Grouping them into plays and diffing against a
    planned playlist happens in the app, with the same code as #279, so there
    is one grouping rule and not two.
    """

    derivation_id: str
    status: str
    error: str | None
    fingerprint_type: str
    fingerprint_version: str
    sample_rate: int | None
    duration_seconds: float | None
    window_seconds: float
    step_seconds: float
    windows: list[WindowMatch]


class IndexJob(TypedDict):
    """One `fingerprint_index_queue` payload: fingerprint this reference track.

    The app resolves the candidate set and stamps each job with what it already
    holds for this track under the active engine — `stored_audio_sha256` is the
    hash of the file as it was when last indexed, or absent when there is no
    row. That is what lets the worker decide skip-or-regenerate from the bytes
    in front of it without a round-trip back to the app per track (#277).

    `run_id` names the progress counters; `force` is how `--all` says "index it
    even if nothing changed".
    """

    run_id: str
    track_id: str
    friend_id: int
    file_path: str
    fingerprint_type: str
    fingerprint_version: str
    stored_audio_sha256: NotRequired[str | None]
    force: NotRequired[bool]


class IndexOutcome(TypedDict):
    """What became of one reference track.

    `indexed`, `skipped` and `failed` are three of the four counters the run
    summary reports; the fourth — unindexable — is counted by the app at resolve
    time, because a track with no `local_audio_url` never reaches the queue.
    """

    run_id: str
    track_id: str
    friend_id: int
    status: str
    error: str | None
    audio_sha256: str | None


class FingerprintUpsert(TypedDict):
    """The body posted to the app to persist one reference fingerprint.

    Mirrors `UpsertTrackFingerprintInput` on the app side. `fingerprint_data` is
    base64 because JSON has no bytes; `None` means the engine stored no payload.
    """

    track_id: str
    friend_id: int
    fingerprint_type: str
    fingerprint_version: str
    fingerprint_data: str | None
    audio_sha256: str
    audio_duration_seconds: float | None
