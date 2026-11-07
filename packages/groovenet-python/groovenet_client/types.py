"""Wire payloads for the endpoints consumed by the Python workers."""

from typing import Literal, NotRequired, TypedDict


class TrackUpdate(TypedDict):
    track_id: str
    friend_id: int
    local_audio_url: NotRequired[str]
    audio_source: NotRequired[Literal["apple_music", "youtube", "soundcloud", "upload", "unknown"]]
    duration_seconds: NotRequired[int]
    audio_file_album_art_url: NotRequired[str]
    bpm: NotRequired[int]
    key: NotRequired[str]
    key_confidence: NotRequired[float]
    bpm_confidence: NotRequired[float]
    danceability: NotRequired[float]
    mood_happy: NotRequired[float]
    mood_sad: NotRequired[float]
    mood_relaxed: NotRequired[float]
    mood_aggressive: NotRequired[float]
    year: NotRequired[str]


class CoverArtResult(TypedDict):
    release_id: str
    friend_id: int
    status: str
    distance: int | None
    applied: bool
    apple_music_art_url: str | None


class StoredFingerprint(TypedDict):
    track_id: str
    friend_id: int
    fingerprint_type: str
    fingerprint_version: str
    fingerprint_data: str | None
    audio_sha256: str
    audio_duration_seconds: float | None


class FingerprintPage(TypedDict):
    fingerprints: list[StoredFingerprint]
    limit: int
    offset: int


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
    #: Where a failed chunk failed (#280): parse, resolve, decode or match.
    error_stage: str | None
    window_start_at: str | None
    duration_seconds: float | None
    sample_rate: int | None
    level_dbfs: float | None
    fingerprint_type: str
    fingerprint_version: str
    candidates: list[MatchCandidate]


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
    audio_size_bytes: int
    audio_mtime_ms: int


class FileStats(TypedDict):
    """The body sent when a fingerprint's audio is unchanged but its size or
    mtime moved, or was never recorded (#303).

    Recording them is what lets the next check skip the hash. The app only
    applies them while `audio_sha256` still matches the stored row.
    """

    track_id: str
    friend_id: int
    fingerprint_type: str
    fingerprint_version: str
    audio_sha256: str
    audio_size_bytes: int
    audio_mtime_ms: int
