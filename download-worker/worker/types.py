from typing import Any, Literal, TypedDict

JobType = Literal[
    "download",
    "fix-duration",
    "fix_duration",
    "analyze-local",
    "analyze_local",
    "extract-cover-art",
    "extract_cover_art",
    "extract-cover-art-album",
    "extract_cover_art_album",
]


class _JobDataRequired(TypedDict):
    track_id: str
    friend_id: int


class JobData(_JobDataRequired, total=False):
    """Job payload from the Redis queue.

    Required: track_id, friend_id.
    All other fields are optional.  Extra keys from the queue are allowed at
    runtime; they won't be flagged by the type checker when accessed via .get().
    """

    job_id: str
    job_type: str
    release_id: str
    local_audio_url: str
    apple_music_url: str
    youtube_url: str
    soundcloud_url: str
    # gamdl settings
    quality: str
    format: str
    save_cover: bool
    cover_format: str
    save_lyrics: bool
    lyrics_format: str
    overwrite_existing: bool
    skip_music_videos: bool
    max_retries: int


class JobResult(TypedDict, total=False):
    """Return value from job handlers, serialised into Redis."""

    success: bool
    error: str
    track_id: str
    friend_id: int
    release_id: str
    local_audio_url: str
    audio_file_album_art_url: str
    duration_seconds: int
    analysis: dict[str, Any]
