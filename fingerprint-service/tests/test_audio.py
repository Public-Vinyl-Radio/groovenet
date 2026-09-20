import shutil
import struct
import subprocess

import pytest
from fingerprint_service import audio
from fingerprint_service.audio import AudioDecodeError, NormalizedAudio, decode_to_pcm

needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")


def completed(returncode=0, stdout=b"", stderr=b""):
    return subprocess.CompletedProcess(args=[], returncode=returncode, stdout=stdout, stderr=stderr)


def pcm(samples):
    return b"".join(struct.pack("<h", s) for s in samples)


class TestNormalizedAudio:
    def test_counts_samples_by_pairs_of_bytes(self):
        assert NormalizedAudio(pcm=pcm([1, 2, 3]), sample_rate=22050).sample_count == 3

    def test_duration_is_samples_over_rate(self):
        clip = NormalizedAudio(pcm=pcm([0] * 11025), sample_rate=22050)
        assert clip.duration_seconds == pytest.approx(0.5)


class TestDecodeToPcm:
    def test_rejects_an_unsupported_sample_rate(self, wav_file):
        with pytest.raises(AudioDecodeError, match="not one of"):
            decode_to_pcm(wav_file(), 48000)

    def test_rejects_a_missing_file(self, ingest_dir):
        with pytest.raises(AudioDecodeError, match="no such file"):
            decode_to_pcm(str(ingest_dir / "gone.wav"))

    def test_raises_when_ffmpeg_fails(self, wav_file, monkeypatch):
        monkeypatch.setattr(
            audio, "_run_ffmpeg", lambda cmd, timeout: completed(1, stderr=b"Invalid data")
        )
        with pytest.raises(AudioDecodeError, match="exited 1: Invalid data"):
            decode_to_pcm(wav_file())

    def test_raises_when_nothing_decodes(self, wav_file, monkeypatch):
        monkeypatch.setattr(audio, "_run_ffmpeg", lambda cmd, timeout: completed(0, stdout=b""))
        with pytest.raises(AudioDecodeError, match="decoded no audio"):
            decode_to_pcm(wav_file())

    def test_warns_but_succeeds_when_ffmpeg_reports_recoverable_damage(
        self, wav_file, monkeypatch, caplog
    ):
        monkeypatch.setattr(
            audio,
            "_run_ffmpeg",
            lambda cmd, timeout: completed(0, stdout=pcm([0] * 22050), stderr=b"header missing"),
        )
        result = decode_to_pcm(wav_file())
        assert result.sample_count == 22050
        assert "header missing" in caplog.text

    def test_asks_ffmpeg_for_mono_pcm_at_the_requested_rate(self, wav_file, monkeypatch):
        seen = {}

        def capture(cmd, timeout):
            seen["cmd"] = cmd
            return completed(0, stdout=pcm([0] * 44100))

        monkeypatch.setattr(audio, "_run_ffmpeg", capture)
        decode_to_pcm(wav_file(), 44100)

        cmd = seen["cmd"]
        assert cmd[cmd.index("-ac") + 1] == "1"
        assert cmd[cmd.index("-ar") + 1] == "44100"
        assert cmd[cmd.index("-f") + 1] == "s16le"
        assert cmd[-1] == "-", "decoded audio must come back on stdout, never via a temp file"


class TestTruncationGuard:
    def _decode(self, wav_file, monkeypatch, seconds, declared):
        monkeypatch.setattr(
            audio,
            "_run_ffmpeg",
            lambda cmd, timeout: completed(0, stdout=pcm([0] * int(22050 * seconds))),
        )
        return decode_to_pcm(wav_file(), 22050, declared_duration=declared)

    def test_rejects_audio_much_shorter_than_ingested(self, wav_file, monkeypatch):
        with pytest.raises(AudioDecodeError, match="truncated upload"):
            self._decode(wav_file, monkeypatch, seconds=4.0, declared=15.0)

    def test_tolerates_a_small_shortfall(self, wav_file, monkeypatch):
        result = self._decode(wav_file, monkeypatch, seconds=14.5, declared=15.0)
        assert result.duration_seconds == pytest.approx(14.5, abs=0.01)

    def test_warns_but_accepts_audio_longer_than_ingested(self, wav_file, monkeypatch, caplog):
        result = self._decode(wav_file, monkeypatch, seconds=20.0, declared=15.0)
        assert result.duration_seconds == pytest.approx(20.0, abs=0.01)
        assert "longer than its ingested duration" in caplog.text

    @pytest.mark.parametrize("declared", [None, 0, 0.0])
    def test_skips_the_check_when_no_duration_was_ingested(self, wav_file, monkeypatch, declared):
        result = self._decode(wav_file, monkeypatch, seconds=1.0, declared=declared)
        assert result.duration_seconds == pytest.approx(1.0, abs=0.01)


class TestRunFfmpeg:
    def test_reports_a_missing_binary_as_a_decode_error(self, monkeypatch):
        def boom(*args, **kwargs):
            raise FileNotFoundError()

        monkeypatch.setattr(subprocess, "run", boom)
        with pytest.raises(AudioDecodeError, match="ffmpeg is not installed"):
            audio._run_ffmpeg(["ffmpeg"], 5)

    def test_reports_a_timeout_as_a_decode_error(self, monkeypatch):
        def boom(*args, **kwargs):
            raise subprocess.TimeoutExpired(cmd="ffmpeg", timeout=5)

        monkeypatch.setattr(subprocess, "run", boom)
        with pytest.raises(AudioDecodeError, match="timed out after 5s"):
            audio._run_ffmpeg(["ffmpeg"], 5)


@needs_ffmpeg
class TestAgainstRealFfmpeg:
    def test_decodes_a_wav_to_the_requested_rate(self, wav_file):
        result = decode_to_pcm(wav_file(seconds=2.0, sample_rate=44100), 22050)
        assert result.sample_rate == 22050
        assert result.duration_seconds == pytest.approx(2.0, abs=0.05)

    def test_downmixes_stereo_to_mono(self, wav_file):
        result = decode_to_pcm(wav_file(seconds=1.0, channels=2), 22050)
        assert result.duration_seconds == pytest.approx(1.0, abs=0.05)

    def test_rejects_a_file_that_is_not_audio(self, ingest_dir):
        path = ingest_dir / "not-audio.wav"
        path.write_bytes(b"this is not a RIFF header")
        with pytest.raises(AudioDecodeError):
            decode_to_pcm(str(path))
