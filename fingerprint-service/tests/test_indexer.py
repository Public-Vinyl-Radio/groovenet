"""The reference-library indexer (#277).

The acceptance criteria are mostly about *not* doing work: a second run indexes
nothing, a changed file re-indexes exactly one track, a version bump regenerates
one engine and leaves the others alone. Those are the cases with teeth, so they
get the most attention here.
"""
import base64
import hashlib
import os
import shutil

import pytest
from fingerprint_service import indexer
from fingerprint_service.audio import AudioDecodeError, NormalizedAudio
from fingerprint_service.indexer import (
    InvalidIndexJob,
    build_upsert,
    file_stats,
    hash_file,
    index_track,
    needs_index,
    parse_index_job,
    resolve_audio_path,
    unchanged_on_disk,
)
from fingerprint_service.matcher import StubMatcher


class RecordingMatcher(StubMatcher):
    """A stub that remembers what it was asked to index."""

    def __init__(self, payload: bytes | None = b"fp"):
        super().__init__()
        self.payload = payload
        self.indexed: list[NormalizedAudio] = []

    def index(self, audio):
        self.indexed.append(audio)
        return self.payload


class TestParseIndexJob:
    def test_accepts_a_well_formed_job(self, index_job):
        job = parse_index_job(index_job())
        assert job["track_id"] == "track-1"
        assert job["friend_id"] == 1

    def test_coerces_a_string_friend_id(self, index_job):
        # The app sends JSON numbers, but a hand-enqueued job from redis-cli is
        # a realistic way for this to arrive as a string.
        assert parse_index_job(index_job(friend_id="7"))["friend_id"] == 7

    @pytest.mark.parametrize("field", ["run_id", "track_id", "friend_id", "file_path"])
    def test_rejects_a_missing_required_field(self, index_job, field):
        with pytest.raises(InvalidIndexJob, match=field):
            parse_index_job(index_job(**{field: None}))

    def test_rejects_a_non_object_payload(self):
        with pytest.raises(InvalidIndexJob, match="expected a JSON object"):
            parse_index_job(["not", "an", "object"])

    def test_rejects_an_unparseable_friend_id(self, index_job):
        with pytest.raises(InvalidIndexJob, match="friend_id must be an integer"):
            parse_index_job(index_job(friend_id="one"))


class TestResolveAudioPath:
    def test_resolves_a_bare_filename_against_the_volume(self, audio_dir):
        assert resolve_audio_path("track.m4a") == str(audio_dir / "track.m4a")

    def test_refuses_a_path_escaping_the_volume(self, audio_dir):
        with pytest.raises(InvalidIndexJob, match="resolves outside"):
            resolve_audio_path("../../etc/passwd")

    def test_refuses_an_absolute_path_elsewhere(self, audio_dir):
        with pytest.raises(InvalidIndexJob, match="resolves outside"):
            resolve_audio_path("/etc/passwd")


class TestHashFile:
    def test_matches_hashlib_over_the_whole_file(self, audio_dir):
        path = audio_dir / "track.bin"
        path.write_bytes(b"abc" * 10_000)
        assert hash_file(str(path)) == hashlib.sha256(b"abc" * 10_000).hexdigest()

    def test_is_unaffected_by_the_read_size(self, audio_dir):
        path = audio_dir / "track.bin"
        path.write_bytes(b"x" * 5000)
        assert hash_file(str(path), chunk_size=7) == hash_file(str(path), chunk_size=4096)


class TestNeedsIndex:
    """The skip/regenerate decision matrix."""

    def test_indexes_when_nothing_is_stored(self):
        assert needs_index(None, "abc") is True

    def test_indexes_when_the_stored_hash_is_empty(self):
        # A row with an empty hash is not a row worth trusting.
        assert needs_index("", "abc") is True

    def test_skips_when_the_hash_is_unchanged(self):
        assert needs_index("abc", "abc") is False

    def test_indexes_when_the_audio_changed(self):
        assert needs_index("abc", "def") is True

    def test_force_overrides_an_unchanged_hash(self):
        assert needs_index("abc", "abc", force=True) is True


class TestBuildUpsert:
    def test_base64_encodes_the_payload(self, index_job):
        upsert = build_upsert(index_job(), b"\x00\x01\x02", "abc", 12.5, 10, 20)
        assert upsert["fingerprint_data"] == base64.b64encode(b"\x00\x01\x02").decode()
        assert upsert["audio_sha256"] == "abc"
        assert upsert["audio_duration_seconds"] == 12.5

    def test_keeps_a_null_payload_null(self, index_job):
        # Distinct from b"" — the stub stores nothing, and the column is
        # nullable exactly so it can say so.
        assert build_upsert(index_job(), None, "abc", 1.0, 10, 20)["fingerprint_data"] is None

    def test_carries_the_engine_identity_through(self, index_job):
        upsert = build_upsert(
            index_job(fingerprint_type="chromaprint", fingerprint_version="2"),
            b"fp",
            "abc",
            1.0,
            10,
            20,
        )
        assert upsert["fingerprint_type"] == "chromaprint"
        assert upsert["fingerprint_version"] == "2"

    def test_carries_the_audio_size_and_mtime(self, index_job):
        upsert = build_upsert(index_job(), b"fp", "abc", 1.0, 41_234_567, 1_790_000_000_123)
        assert upsert["audio_size_bytes"] == 41_234_567
        assert upsert["audio_mtime_ms"] == 1_790_000_000_123


class TestFileStats:
    """What lets a re-check skip the hash (#303)."""

    def test_reads_size_and_whole_milliseconds(self, tmp_path):
        path = tmp_path / "track.m4a"
        path.write_bytes(b"x" * 1234)
        os.utime(path, ns=(1_790_000_000_123_456_789, 1_790_000_000_123_456_789))
        assert file_stats(str(path)) == (1234, 1_790_000_000_123)

    @pytest.mark.parametrize(
        "stored, expected",
        [
            ({"stored_audio_sha256": "abc", "stored_audio_size_bytes": 10, "stored_audio_mtime_ms": 20}, True),
            ({"stored_audio_sha256": "abc", "stored_audio_size_bytes": 11, "stored_audio_mtime_ms": 20}, False),
            ({"stored_audio_sha256": "abc", "stored_audio_size_bytes": 10, "stored_audio_mtime_ms": 21}, False),
            # A row from before stats were recorded: hashed as always.
            ({"stored_audio_sha256": "abc", "stored_audio_size_bytes": None, "stored_audio_mtime_ms": None}, False),
            ({"stored_audio_sha256": "abc"}, False),
            # Nothing stored means nothing to be unchanged from.
            ({"stored_audio_sha256": None, "stored_audio_size_bytes": 10, "stored_audio_mtime_ms": 20}, False),
            ({"stored_audio_sha256": "abc", "stored_audio_size_bytes": 10, "stored_audio_mtime_ms": 20, "force": True}, False),
        ],
    )
    def test_unchanged_only_when_everything_stored_matches(self, index_job, stored, expected):
        assert unchanged_on_disk(index_job(**stored), 10, 20) is expected


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")
class TestIndexTrack:
    """End to end against real files and a real decode.

    CI asserts ffmpeg is present, so these cannot silently stop running.
    """

    def test_indexes_a_track_with_no_stored_fingerprint(self, index_job, reference_wav):
        name = reference_wav()
        matcher = RecordingMatcher()

        result, upsert, _ = index_track(index_job(file_path=name), matcher)

        assert result["status"] == "indexed"
        assert result["error"] is None
        assert upsert is not None
        assert upsert["fingerprint_data"] == base64.b64encode(b"fp").decode()
        assert upsert["audio_sha256"] == result["audio_sha256"]
        assert len(matcher.indexed) == 1

    def test_second_run_does_no_work(self, index_job, reference_wav, audio_dir):
        """Re-running immediately performs no regeneration."""
        name = reference_wav()
        matcher = RecordingMatcher()

        first, upsert, _ = index_track(index_job(file_path=name), matcher)
        second, second_upsert, _ = index_track(
            index_job(file_path=name, stored_audio_sha256=upsert["audio_sha256"]),
            matcher,
        )

        assert first["status"] == "indexed"
        assert second["status"] == "skipped"
        assert second_upsert is None
        # The decisive assertion: the matcher was never asked a second time.
        assert len(matcher.indexed) == 1

    def test_a_changed_file_is_reindexed(self, index_job, reference_wav):
        """Changing a source audio file causes that track to be re-fingerprinted."""
        name = reference_wav(freq=440)
        matcher = RecordingMatcher()
        _, upsert, _ = index_track(index_job(file_path=name), matcher)

        # Same filename, different audio — a re-rip.
        reference_wav(name=name, freq=880)
        result, second_upsert, _ = index_track(
            index_job(file_path=name, stored_audio_sha256=upsert["audio_sha256"]),
            matcher,
        )

        assert result["status"] == "indexed"
        assert second_upsert["audio_sha256"] != upsert["audio_sha256"]
        assert len(matcher.indexed) == 2

    def test_a_version_bump_regenerates_for_that_version_only(
        self, index_job, reference_wav
    ):
        """Bumping fingerprint_version regenerates that type, leaving others intact.

        The app resolves candidates per (type, version), so a bumped version
        arrives with no stored hash — and the rows it does not ask about are
        never read, let alone written.
        """
        name = reference_wav()
        matcher = RecordingMatcher()
        _, v1, _ = index_track(index_job(file_path=name, fingerprint_version="1"), matcher)

        result, v2, _ = index_track(
            index_job(
                file_path=name,
                fingerprint_version="2",
                stored_audio_sha256=None,
            ),
            matcher,
        )

        assert result["status"] == "indexed"
        assert v2["fingerprint_version"] == "2"
        assert v1["fingerprint_version"] == "1"
        # Same audio, so the same hash under both versions — the rows differ
        # only in the identity they were generated for.
        assert v2["audio_sha256"] == v1["audio_sha256"]

    def test_force_reindexes_an_unchanged_file(self, index_job, reference_wav):
        name = reference_wav()
        matcher = RecordingMatcher()
        _, upsert, _ = index_track(index_job(file_path=name), matcher)

        result, _, _ = index_track(
            index_job(
                file_path=name,
                stored_audio_sha256=upsert["audio_sha256"],
                force=True,
            ),
            matcher,
        )

        assert result["status"] == "indexed"
        assert len(matcher.indexed) == 2

    def test_records_the_decoded_duration(self, index_job, reference_wav):
        name = reference_wav(seconds=2.0)
        _, upsert, _ = index_track(index_job(file_path=name), RecordingMatcher())
        assert upsert["audio_duration_seconds"] == pytest.approx(2.0, abs=0.05)

    def test_a_corrupt_file_fails_without_raising(self, index_job, audio_dir):
        """A single corrupt file is reported and skipped without ending the run."""
        (audio_dir / "broken.m4a").write_bytes(b"this is not audio")

        result, upsert, _ = index_track(
            index_job(file_path="broken.m4a"), RecordingMatcher()
        )

        assert result["status"] == "failed"
        assert result["error"]
        assert upsert is None
        # Hashed before the decode was attempted, so the failure is attributable
        # to a specific version of the file.
        assert result["audio_sha256"]


class TestIndexTrackWithoutDecoding:
    """Failure paths that never reach ffmpeg, so they need none installed."""

    def test_a_missing_file_fails_that_track(self, index_job, audio_dir):
        result, upsert, _ = index_track(
            index_job(file_path="gone.m4a"), RecordingMatcher()
        )

        assert result["status"] == "failed"
        assert "no such file" in result["error"]
        assert upsert is None
        assert result["audio_sha256"] is None

    def test_an_unreadable_file_fails_that_track(self, index_job, audio_dir, monkeypatch):
        (audio_dir / "locked.m4a").write_bytes(b"x")
        monkeypatch.setattr(
            "fingerprint_service.indexer.hash_file",
            lambda *a, **k: (_ for _ in ()).throw(OSError("permission denied")),
        )

        result, upsert, _ = index_track(
            index_job(file_path="locked.m4a"), RecordingMatcher()
        )

        assert result["status"] == "failed"
        assert "permission denied" in result["error"]
        assert upsert is None

    def test_an_escaping_path_raises_for_the_caller_to_isolate(
        self, index_job, audio_dir
    ):
        with pytest.raises(InvalidIndexJob):
            index_track(index_job(file_path="../../etc/passwd"), RecordingMatcher())

    def test_skips_without_decoding_when_unchanged(
        self, index_job, audio_dir, monkeypatch
    ):
        (audio_dir / "track.m4a").write_bytes(b"audio bytes")
        stored = hashlib.sha256(b"audio bytes").hexdigest()

        def explode(*args, **kwargs):
            raise AssertionError("decode must not be attempted for an unchanged file")

        monkeypatch.setattr("fingerprint_service.indexer.decode_to_pcm", explode)

        result, upsert, _ = index_track(
            index_job(file_path="track.m4a", stored_audio_sha256=stored),
            RecordingMatcher(),
        )

        assert result["status"] == "skipped"
        assert upsert is None

    def test_a_decode_failure_is_reported_not_raised(
        self, index_job, audio_dir, monkeypatch
    ):
        (audio_dir / "track.m4a").write_bytes(b"audio bytes")
        monkeypatch.setattr(
            "fingerprint_service.indexer.decode_to_pcm",
            lambda *a, **k: (_ for _ in ()).throw(AudioDecodeError("ffmpeg exited 1")),
        )

        result, upsert, _ = index_track(index_job(file_path="track.m4a"), RecordingMatcher())

        assert result["status"] == "failed"
        assert "ffmpeg exited 1" in result["error"]
        assert upsert is None


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")
class TestReplacedAudio:
    """#303: the index must follow audio replaced behind an unchanged path."""

    def fingerprinted(self, index_job, reference_wav):
        name = reference_wav(freq=440)
        _, upsert, _ = index_track(index_job(file_path=name), RecordingMatcher())
        return name, upsert

    def stored(self, index_job, name, upsert, **overrides):
        return index_job(
            file_path=name,
            stored_audio_sha256=upsert["audio_sha256"],
            stored_audio_size_bytes=upsert["audio_size_bytes"],
            stored_audio_mtime_ms=upsert["audio_mtime_ms"],
            **overrides,
        )

    def test_an_untouched_file_is_skipped_without_being_read(
        self, index_job, reference_wav, monkeypatch
    ):
        name, upsert = self.fingerprinted(index_job, reference_wav)

        def must_not_hash(path):
            raise AssertionError("an untouched file must not be hashed")

        monkeypatch.setattr(indexer, "hash_file", must_not_hash)
        matcher = RecordingMatcher()
        result, new_upsert, stats = index_track(self.stored(index_job, name, upsert), matcher)

        assert result["status"] == "skipped"
        assert result["audio_sha256"] == upsert["audio_sha256"]
        assert (new_upsert, stats) == (None, None)
        assert matcher.indexed == []

    def test_a_replaced_file_is_refingerprinted_with_its_new_stats(self, index_job, reference_wav):
        name, upsert = self.fingerprinted(index_job, reference_wav)
        reference_wav(name=name, freq=880, seconds=2.0)  # a re-rip: new bytes, new size

        matcher = RecordingMatcher()
        result, new_upsert, stats = index_track(self.stored(index_job, name, upsert), matcher)

        assert result["status"] == "indexed"
        assert new_upsert["audio_sha256"] != upsert["audio_sha256"]
        assert new_upsert["audio_size_bytes"] != upsert["audio_size_bytes"]
        assert stats is None
        assert len(matcher.indexed) == 1

    def test_a_touched_file_with_the_same_bytes_records_its_new_mtime(self, index_job, reference_wav, audio_dir):
        name, upsert = self.fingerprinted(index_job, reference_wav)
        later = upsert["audio_mtime_ms"] + 60_000
        os.utime(audio_dir / name, ns=(later * 1_000_000, later * 1_000_000))

        matcher = RecordingMatcher()
        result, new_upsert, stats = index_track(self.stored(index_job, name, upsert), matcher)

        assert result["status"] == "skipped"
        assert new_upsert is None
        assert matcher.indexed == []
        assert stats == {
            "track_id": "track-1",
            "friend_id": 1,
            "fingerprint_type": "stub",
            "fingerprint_version": "0",
            "audio_sha256": upsert["audio_sha256"],
            "audio_size_bytes": upsert["audio_size_bytes"],
            "audio_mtime_ms": later,
        }

    def test_an_older_row_gains_its_stats_on_the_first_check(self, index_job, reference_wav):
        name, upsert = self.fingerprinted(index_job, reference_wav)

        result, _, stats = index_track(
            index_job(file_path=name, stored_audio_sha256=upsert["audio_sha256"]),
            RecordingMatcher(),
        )

        assert result["status"] == "skipped"
        assert stats["audio_size_bytes"] == upsert["audio_size_bytes"]
        assert stats["audio_mtime_ms"] == upsert["audio_mtime_ms"]

    def test_force_regenerates_even_an_untouched_file(self, index_job, reference_wav):
        name, upsert = self.fingerprinted(index_job, reference_wav)
        matcher = RecordingMatcher()
        result, _, _ = index_track(self.stored(index_job, name, upsert, force=True), matcher)
        assert result["status"] == "indexed"
        assert len(matcher.indexed) == 1

    def test_a_file_that_cannot_be_statted_fails_the_track(self, index_job, reference_wav, monkeypatch):
        name = reference_wav()

        def unreadable(path):
            raise PermissionError("permission denied")

        monkeypatch.setattr(indexer, "file_stats", unreadable)
        result, upsert, stats = index_track(index_job(file_path=name), RecordingMatcher())

        assert result["status"] == "failed"
        assert "permission denied" in result["error"]
        assert (upsert, stats) == (None, None)
