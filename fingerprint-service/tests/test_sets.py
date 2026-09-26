"""Set derivation: a whole recording in, one match per window out (#282)."""
import math
import struct
import wave

import pytest
from fingerprint_service import sets
from fingerprint_service.audio import AudioDecodeError, NormalizedAudio
from fingerprint_service.chromaprint_engine import FingerprintError, RawFingerprint
from fingerprint_service.matcher import ChromaprintMatcher, StubMatcher
from fingerprint_service.reference_index import ReferenceIndex, TrackRef
from fingerprint_service.sets import (
    InvalidSetJob,
    derive,
    parse_set_job,
    resolve_recording_path,
    window_settings,
)

CANDIDATE = {"track_id": "t1", "friend_id": 1, "confidence": 0.9, "offset_seconds": 12.0}


def write_wav(path, pcm: bytes, sample_rate: int = 22050) -> None:
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(sample_rate)
        out.writeframes(pcm)


def sine(seconds: float, sample_rate: int = 22050) -> bytes:
    return b"".join(
        struct.pack("<h", int(8000 * math.sin(2 * math.pi * 440 * i / sample_rate)))
        for i in range(int(seconds * sample_rate))
    )


class TestParseSetJob:
    def test_accepts_a_well_formed_job(self, set_job):
        assert parse_set_job(set_job())["derivation_id"]

    @pytest.mark.parametrize("field", ["derivation_id", "file_path"])
    def test_requires_the_fields_that_name_the_work(self, set_job, field):
        with pytest.raises(InvalidSetJob, match=field):
            parse_set_job(set_job(**{field: ""}))

    def test_rejects_something_that_is_not_an_object(self):
        with pytest.raises(InvalidSetJob, match="JSON object"):
            parse_set_job(["not", "a", "job"])


class TestWindowSettings:
    def test_defaults_to_271s_fifteen_by_fifteen(self, set_job):
        assert window_settings(set_job()) == (15.0, 15.0)

    def test_the_job_may_override_both(self, set_job):
        assert window_settings(set_job(window_seconds=10, step_seconds="5")) == (10.0, 5.0)

    @pytest.mark.parametrize("value", [0, -1])
    def test_rejects_a_non_positive_value(self, set_job, value):
        with pytest.raises(InvalidSetJob, match="positive"):
            window_settings(set_job(step_seconds=value))

    def test_rejects_a_non_number(self, set_job):
        with pytest.raises(InvalidSetJob, match="must be a number"):
            window_settings(set_job(window_seconds="long"))


class TestResolveRecordingPath:
    def test_resolves_inside_the_volume(self, set_dir):
        assert resolve_recording_path("2026/set.mp3") == str(set_dir / "2026" / "set.mp3")

    @pytest.mark.parametrize("escape", ["../etc/passwd", "/etc/passwd"])
    def test_refuses_a_path_outside_the_volume(self, set_dir, escape):
        with pytest.raises(InvalidSetJob, match="outside"):
            resolve_recording_path(escape)


class TestDerive:
    def test_reports_every_window_and_the_duration(self, set_dir, set_job):
        write_wav(set_dir / "set.wav", sine(40.0))

        result = derive(set_job(), StubMatcher(candidates=[CANDIDATE]))

        assert result["status"] == "processed"
        assert result["duration_seconds"] == pytest.approx(40.0, abs=0.05)
        assert result["sample_rate"] == 22050
        assert (result["window_seconds"], result["step_seconds"]) == (15.0, 15.0)
        # 0-15, 15-30, and a 10 s tail: the end of a set is part of it.
        assert [w["start_seconds"] for w in result["windows"]] == [0.0, 15.0, 30.0]
        assert result["windows"][0]["candidates"] == [CANDIDATE]

    def test_derives_against_a_real_index(self, set_dir, set_job, tone_pcm):
        """Two records back to back: early windows name one, later the other."""
        first, second = tone_pcm(40.0, seed=1.0), tone_pcm(40.0, seed=2.3)
        index = ReferenceIndex()
        for track_id, pcm in (("first", first), ("second", second)):
            matcher = ChromaprintMatcher()
            blob = matcher.index(NormalizedAudio(pcm=pcm, sample_rate=22050))
            index.add(TrackRef(track_id, 1), RawFingerprint.from_bytes(blob))
        write_wav(set_dir / "set.wav", first + second)

        result = derive(set_job(), ChromaprintMatcher(index=index))

        named = [w["candidates"][0]["track_id"] if w["candidates"] else None for w in result["windows"]]
        assert named[0] == "first"
        assert named[-1] == "second"

    def test_a_recording_that_will_not_decode_is_a_reported_failure(self, set_dir, set_job):
        (set_dir / "set.wav").write_bytes(b"not a RIFF header")

        result = derive(set_job(), StubMatcher())

        assert result["status"] == "failed"
        assert result["error"]
        assert result["windows"] == []

    def test_a_missing_recording_is_a_reported_failure(self, set_dir, set_job):
        result = derive(set_job(file_path="nowhere.mp3"), StubMatcher())
        assert result["status"] == "failed"
        assert "no such file" in result["error"]

    def test_an_engine_failure_is_a_reported_failure(self, set_dir, set_job, monkeypatch):
        write_wav(set_dir / "set.wav", sine(5.0))

        class Broken(StubMatcher):
            def match_recording(self, pcm_chunks, sample_rate, **kwargs):
                list(pcm_chunks)
                raise FingerprintError("chromaprint failed: boom")

        result = derive(set_job(), Broken())

        assert result["status"] == "failed"
        assert "boom" in result["error"]

    def test_a_decode_that_dies_halfway_fails_the_whole_set(self, set_dir, set_job, monkeypatch):
        # All-or-nothing: half a set's windows would read as a short night.
        def dies(*args, **kwargs):
            yield b"\x00\x00" * 22050
            raise AudioDecodeError("ffmpeg exited 1: truncated")

        monkeypatch.setattr(sets, "stream_pcm", dies)

        result = derive(set_job(), StubMatcher())

        assert result["status"] == "failed"
        assert "truncated" in result["error"]

    def test_is_deterministic(self, set_dir, set_job):
        write_wav(set_dir / "set.wav", sine(20.0))
        matcher = StubMatcher(candidates=[CANDIDATE])
        assert derive(set_job(), matcher) == derive(set_job(), matcher)
