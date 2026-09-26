"""Build the reference index the live matcher searches (#277).

The offline counterpart to `main.handle_job`. A live window arrives as audio and
leaves as a guess; a reference track arrives as a filename and leaves as a row
in `track_fingerprints`. Both go through the same `FingerprintMatcher`, which is
the whole point — an index built by one implementation and searched by another
would be silently, unfixably wrong.

The work per track is: resolve the path, hash it, decide whether the stored row
is still good, and if not, decode and fingerprint. Hashing before decoding is
deliberate — sha256 over a 40 MB file is milliseconds and settles the question
for the overwhelming majority of tracks on a re-run, where a decode would be
seconds wasted.
"""
import base64
import hashlib
import os

from .audio import AudioDecodeError, decode_to_pcm
from .config import AUDIO_DIR, HASH_CHUNK_SIZE, SAMPLE_RATE, logger
from .matcher import FingerprintMatcher
from .types import FileStats, FingerprintUpsert, IndexJob, IndexOutcome

REQUIRED_FIELDS = ("run_id", "track_id", "friend_id", "file_path")

STATUS_INDEXED = "indexed"
STATUS_SKIPPED = "skipped"
STATUS_FAILED = "failed"


class InvalidIndexJob(ValueError):
    """The payload is not something the indexer can act on."""


def parse_index_job(job: object) -> IndexJob:
    """Validate one `fingerprint_index_queue` payload."""
    if not isinstance(job, dict):
        raise InvalidIndexJob(f"expected a JSON object, got {type(job).__name__}")

    missing = [field for field in REQUIRED_FIELDS if job.get(field) in (None, "")]
    if missing:
        raise InvalidIndexJob(f"missing required field(s): {', '.join(missing)}")

    try:
        job["friend_id"] = int(job["friend_id"])
    except (TypeError, ValueError):
        raise InvalidIndexJob(f"friend_id must be an integer, got {job['friend_id']!r}") from None

    return job


def resolve_audio_path(file_path: str) -> str:
    """Absolute path to a reference track, confined to the audio volume.

    `tracks.local_audio_url` is a bare filename in practice, but it is
    user-influenced data that has been through an importer, so the same
    containment rule as the ingest volume applies: a job is not a licence to
    read an arbitrary path.
    """
    root = os.path.realpath(AUDIO_DIR)
    candidate = os.path.realpath(os.path.join(root, file_path))
    if candidate != root and not candidate.startswith(root + os.sep):
        raise InvalidIndexJob(f"{file_path} resolves outside {AUDIO_DIR}")
    return candidate


def hash_file(path: str, chunk_size: int = HASH_CHUNK_SIZE) -> str:
    """Streaming sha256 of the source audio, hex-encoded to match the column."""
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        while chunk := handle.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def file_stats(path: str) -> tuple[int, int]:
    """Size in bytes and mtime in whole milliseconds.

    Milliseconds, not the nanoseconds `stat` offers: ns since the epoch is past
    what a JSON number carries exactly into the app, and a re-rip moves the
    mtime by far more than a millisecond.
    """
    st = os.stat(path)
    return st.st_size, st.st_mtime_ns // 1_000_000


def unchanged_on_disk(job: IndexJob, size: int, mtime_ms: int) -> bool:
    """True when the file is provably the one fingerprinted, without reading it.

    Needs a stored hash and both stored stats to match (#303). A row from
    before stats were recorded has neither and is hashed as it always was —
    which is also how it gets them.
    """
    if job.get("force") or not job.get("stored_audio_sha256"):
        return False
    return (
        job.get("stored_audio_size_bytes") == size
        and job.get("stored_audio_mtime_ms") == mtime_ms
    )


def needs_index(
    stored_audio_sha256: str | None,
    current_audio_sha256: str,
    *,
    force: bool = False,
) -> bool:
    """The skip-or-regenerate decision, in one place.

    Engine and version are not compared here: the app resolved the candidate set
    against the active engine already, so a job that arrives for a given type
    and version is by construction about *that* row. A version bump therefore
    finds no stored hash and regenerates, while rows under other types and
    versions are never consulted and never touched.

    What is left is the audio itself. No stored hash means nothing has been
    indexed; a different hash means the file was re-ripped or replaced; the same
    hash means the stored work is still exactly right.
    """
    if force:
        return True
    if not stored_audio_sha256:
        return True
    return stored_audio_sha256 != current_audio_sha256


def build_upsert(
    job: IndexJob,
    fingerprint_data: bytes | None,
    audio_sha256: str,
    duration_seconds: float | None,
    size: int,
    mtime_ms: int,
) -> FingerprintUpsert:
    """The persistence body for one freshly generated fingerprint."""
    return {
        "track_id": str(job["track_id"]),
        "friend_id": int(job["friend_id"]),
        "fingerprint_type": str(job["fingerprint_type"]),
        "fingerprint_version": str(job["fingerprint_version"]),
        "fingerprint_data": (
            base64.b64encode(fingerprint_data).decode("ascii")
            if fingerprint_data is not None
            else None
        ),
        "audio_sha256": audio_sha256,
        "audio_duration_seconds": duration_seconds,
        "audio_size_bytes": size,
        "audio_mtime_ms": mtime_ms,
    }


def build_file_stats(job: IndexJob, audio_sha256: str, size: int, mtime_ms: int) -> FileStats:
    """The body recording an unchanged file's current size and mtime (#303)."""
    return {
        "track_id": str(job["track_id"]),
        "friend_id": int(job["friend_id"]),
        "fingerprint_type": str(job["fingerprint_type"]),
        "fingerprint_version": str(job["fingerprint_version"]),
        "audio_sha256": audio_sha256,
        "audio_size_bytes": size,
        "audio_mtime_ms": mtime_ms,
    }


def outcome(
    job: IndexJob,
    status: str,
    *,
    error: str | None = None,
    audio_sha256: str | None = None,
) -> IndexOutcome:
    return {
        "run_id": str(job["run_id"]),
        "track_id": str(job["track_id"]),
        "friend_id": int(job["friend_id"]),
        "status": status,
        "error": error,
        "audio_sha256": audio_sha256,
    }


def index_track(
    job: IndexJob,
    matcher: FingerprintMatcher,
) -> tuple[IndexOutcome, FingerprintUpsert | None, FileStats | None]:
    """Fingerprint one reference track, or establish that it needs no work.

    Returns the outcome to count; when something was generated, the body to
    persist; and when unchanged audio has a size or mtime not yet recorded,
    the body recording them. Raising is left to the caller's error isolation:
    one unreadable file must cost that file and nothing else, which is why
    every failure here comes back as a `failed` outcome rather than an
    exception.

    **Stat, then hash, then decide, then decode** (#303). A file whose size and
    mtime match what was fingerprinted is skipped without being read, which is
    what makes re-checking the whole library for replaced audio cheap.
    """
    path = resolve_audio_path(str(job["file_path"]))

    if not os.path.isfile(path):
        # A row pointing at a file that is not there is a real and common state
        # — the track was imported, the download failed or the file was moved.
        # It is a failure of this track, not of the run.
        return outcome(job, STATUS_FAILED, error=f"no such file: {job['file_path']}"), None, None

    try:
        size, mtime_ms = file_stats(path)
        if unchanged_on_disk(job, size, mtime_ms):
            logger.info("Track %s is untouched on disk; skipping without a hash", job["track_id"])
            return outcome(job, STATUS_SKIPPED, audio_sha256=job.get("stored_audio_sha256")), None, None
        audio_sha256 = hash_file(path)
    except OSError as e:
        return outcome(job, STATUS_FAILED, error=f"could not read {job['file_path']}: {e}"), None, None

    if not needs_index(
        job.get("stored_audio_sha256"),
        audio_sha256,
        force=bool(job.get("force")),
    ):
        logger.info(
            "Track %s is unchanged under %s %s; skipping",
            job["track_id"],
            job["fingerprint_type"],
            job["fingerprint_version"],
        )
        # Same bytes. If the size or mtime moved (a touch, a copy) or was never
        # recorded, record them now so the next check needs no hash.
        stats = None
        if (job.get("stored_audio_size_bytes"), job.get("stored_audio_mtime_ms")) != (size, mtime_ms):
            stats = build_file_stats(job, audio_sha256, size, mtime_ms)
        return outcome(job, STATUS_SKIPPED, audio_sha256=audio_sha256), None, stats

    try:
        audio = decode_to_pcm(path, SAMPLE_RATE)
    except AudioDecodeError as e:
        logger.error("Track %s could not be decoded: %s", job["track_id"], e)
        return outcome(job, STATUS_FAILED, error=str(e), audio_sha256=audio_sha256), None, None

    fingerprint_data = matcher.index(audio)
    logger.info(
        "Indexed track %s under %s %s (%.2fs)",
        job["track_id"],
        job["fingerprint_type"],
        job["fingerprint_version"],
        audio.duration_seconds,
    )
    return (
        outcome(job, STATUS_INDEXED, audio_sha256=audio_sha256),
        build_upsert(job, fingerprint_data, audio_sha256, audio.duration_seconds, size, mtime_ms),
        None,
    )
