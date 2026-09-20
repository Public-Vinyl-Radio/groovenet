import math
import struct
import wave

import fakeredis
import pytest


@pytest.fixture
def fake_redis():
    server = fakeredis.FakeServer()
    return fakeredis.FakeRedis(server=server, decode_responses=True)


@pytest.fixture(autouse=True)
def patch_redis(fake_redis, monkeypatch):
    """Replace the module-level redis_conn in every module that holds a reference."""
    monkeypatch.setattr("fingerprint_service.main.redis_conn", fake_redis)


@pytest.fixture
def ingest_dir(tmp_path, monkeypatch):
    """Point the service's ingest volume at a temp directory.

    `main` captures AUDIO_INGEST_DIR at import, so patch it there.
    """
    directory = tmp_path / "audio-ingest"
    directory.mkdir()
    monkeypatch.setattr("fingerprint_service.main.AUDIO_INGEST_DIR", str(directory))
    return directory


@pytest.fixture
def wav_file(ingest_dir):
    """Write a real WAV into the ingest directory and return its path.

    Built with the `wave` module rather than committed as a binary, matching how
    the ingest route's own fixtures are specified (#275). A tone rather than
    silence, so a decode that drops it is visible.
    """
    def _make(name="chunk.wav", seconds=1.0, sample_rate=44100, channels=1, freq=440):
        path = ingest_dir / name
        frames = []
        for i in range(int(seconds * sample_rate)):
            sample = struct.pack("<h", int(16000 * math.sin(2 * math.pi * freq * i / sample_rate)))
            frames.append(sample * channels)
        with wave.open(str(path), "wb") as out:
            out.setnchannels(channels)
            out.setsampwidth(2)
            out.setframerate(sample_rate)
            out.writeframes(b"".join(frames))
        return str(path)

    return _make


@pytest.fixture
def job():
    """Factory for a well-formed queue payload."""
    def _make(**overrides):
        base = {
            "ingest_id": "11111111-1111-1111-1111-111111111111",
            "source_id": "living-room-vinyl",
            "session_id": "session-1",
            "sequence": 7,
            "captured_at": "2026-09-20T18:42:10Z",
            "file_path": "chunk.wav",
            "duration_seconds": 15.0,
            "sample_rate": 44100,
            "channels": 1,
            "codec": "pcm_s16le",
        }
        base.update(overrides)
        return base

    return _make
