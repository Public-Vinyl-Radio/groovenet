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
def audio_dir(tmp_path, monkeypatch):
    """Point the reference library volume at a temp directory.

    `indexer` captures AUDIO_DIR at import, so patch it there — the same rule
    that applies to `main`'s AUDIO_INGEST_DIR.
    """
    directory = tmp_path / "audio"
    directory.mkdir()
    monkeypatch.setattr("fingerprint_service.indexer.AUDIO_DIR", str(directory))
    return directory


@pytest.fixture
def reference_wav(audio_dir):
    """Write a real WAV into the reference library and return its filename.

    Returns the bare name rather than the path: that is what
    `tracks.local_audio_url` holds and therefore what an index job carries.
    """
    def _make(name="artist - title.m4a", seconds=1.0, sample_rate=44100, freq=440):
        path = audio_dir / name
        frames = []
        for i in range(int(seconds * sample_rate)):
            frames.append(
                struct.pack("<h", int(16000 * math.sin(2 * math.pi * freq * i / sample_rate)))
            )
        with wave.open(str(path), "wb") as out:
            out.setnchannels(1)
            out.setsampwidth(2)
            out.setframerate(sample_rate)
            out.writeframes(b"".join(frames))
        return name

    return _make


@pytest.fixture
def index_job():
    """Factory for a well-formed `fingerprint_index_queue` payload."""
    def _make(**overrides):
        base = {
            "run_id": "22222222-2222-2222-2222-222222222222",
            "track_id": "track-1",
            "friend_id": 1,
            "file_path": "artist - title.m4a",
            "fingerprint_type": "stub",
            "fingerprint_version": "0",
            "stored_audio_sha256": None,
            "force": False,
        }
        base.update(overrides)
        return base

    return _make


@pytest.fixture
def tone_pcm():
    """Mono 16-bit PCM standing in for one track.

    Six seed-chosen partials, each with its own vibrato, rather than a single
    swept tone. That matters: Chromaprint keys off how the spectrum moves, so
    two tracks built from the same formula with different scalars fingerprint
    *alike* — an earlier version of this fixture produced a false match at a bit
    error rate of 0.21 and made the matcher look broken when it was not. Drawing
    the partials per seed gives the same bimodal separation the real corpus has:
    the same seed matches at ~0.0, a different one sits at ~0.39.

    `noise` degrades a capture the way a mix does, for testing recall.
    """
    def _make(seconds=20.0, sample_rate=22050, seed=1.0, noise=0.0):
        import random

        rng = random.Random(int(seed * 1000))
        partials = [
            (rng.uniform(110, 3000), rng.uniform(0.2, 1.0), rng.uniform(0.05, 0.4))
            for _ in range(6)
        ]
        noise_rng = random.Random(int(seed * 1000) + 7)
        out = bytearray()
        for i in range(int(seconds * sample_rate)):
            t = i / sample_rate
            sample = 0.0
            for freq, amp, rate in partials:
                vibrato = freq + freq * 0.15 * math.sin(2 * math.pi * rate * t)
                sample += amp * 4000 * math.sin(2 * math.pi * vibrato * t)
            if noise:
                sample += noise_rng.gauss(0, noise * 4000)
            out += struct.pack("<h", max(-32768, min(32767, int(sample))))
        return bytes(out)

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


@pytest.fixture
def set_dir(tmp_path, monkeypatch):
    """Point the set recordings volume at a temp directory (#282).

    `sets` captures SET_RECORDINGS_DIR at import, like the other volumes.
    """
    directory = tmp_path / "set-recordings"
    directory.mkdir()
    monkeypatch.setattr("fingerprint_service.sets.SET_RECORDINGS_DIR", str(directory))
    return directory


@pytest.fixture
def set_job():
    """Factory for a well-formed `fingerprint_set_queue` payload."""
    def _make(**overrides):
        base = {
            "derivation_id": "33333333-3333-3333-3333-333333333333",
            "file_path": "set.wav",
        }
        base.update(overrides)
        return base

    return _make
