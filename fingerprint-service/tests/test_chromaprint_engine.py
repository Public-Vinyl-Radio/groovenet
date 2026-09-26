"""The Chromaprint binding (#278)."""
import pytest
from fingerprint_service.chromaprint_engine import (
    SECONDS_PER_VALUE,
    FingerprintError,
    RawFingerprint,
    fingerprint_pcm,
    fingerprint_stream,
    library_version,
)


class TestRawFingerprint:
    def test_round_trips_through_bytes(self):
        fp = RawFingerprint((0x00000000, 0xFFFFFFFF, 0x12345678))
        assert RawFingerprint.from_bytes(fp.to_bytes()).values == fp.values

    def test_packs_four_bytes_per_value(self):
        assert len(RawFingerprint((1, 2, 3)).to_bytes()) == 12

    def test_is_little_endian(self):
        # The column stores whatever this writes, so the byte order is a
        # compatibility promise, not an implementation detail.
        assert RawFingerprint((1,)).to_bytes() == b"\x01\x00\x00\x00"

    def test_rejects_a_truncated_blob(self):
        with pytest.raises(FingerprintError, match="whole number of uint32s"):
            RawFingerprint.from_bytes(b"\x01\x02\x03")

    def test_reports_duration_from_the_frame_hop(self):
        assert RawFingerprint((0,) * 100).duration_seconds == pytest.approx(
            100 * SECONDS_PER_VALUE
        )

    def test_an_empty_fingerprint_is_zero_length(self):
        assert RawFingerprint(()).duration_seconds == 0

    def test_variety_is_the_fraction_of_distinct_values(self):
        # Real music: nearly every value distinct (#306).
        assert RawFingerprint((1, 2, 3, 4)).variety == 1.0
        # Silence: Chromaprint repeats the same value with no signal to move.
        assert RawFingerprint((7, 7, 7, 7)).variety == 0.25

    def test_an_empty_fingerprint_has_zero_variety(self):
        # Never reached through match() — it already refuses an empty
        # fingerprint before asking for variety — but a property on the
        # dataclass should not raise on its own edge case.
        assert RawFingerprint(()).variety == 0.0


class TestFingerprintPcm:
    def test_fingerprints_a_tone(self, tone_pcm):
        fp = fingerprint_pcm(tone_pcm(20.0), 22050)
        assert len(fp.values) > 50
        assert all(0 <= v <= 0xFFFFFFFF for v in fp.values)

    def test_is_deterministic(self, tone_pcm):
        pcm = tone_pcm(20.0)
        assert fingerprint_pcm(pcm, 22050).values == fingerprint_pcm(pcm, 22050).values

    def test_different_audio_fingerprints_differently(self, tone_pcm):
        a = fingerprint_pcm(tone_pcm(20.0, seed=1.0), 22050)
        b = fingerprint_pcm(tone_pcm(20.0, seed=2.7), 22050)
        assert a.values != b.values

    def test_the_value_rate_matches_the_documented_hop(self, tone_pcm):
        # Offsets are reported in values; if this drifts, every offset is wrong.
        short = len(fingerprint_pcm(tone_pcm(10.0), 22050).values)
        long = len(fingerprint_pcm(tone_pcm(30.0), 22050).values)
        measured = (30.0 - 10.0) / (long - short)
        assert measured == pytest.approx(SECONDS_PER_VALUE, rel=0.02)

    def test_audio_too_short_produces_nothing(self, tone_pcm):
        # Chromaprint buffers a few seconds before emitting. Unmatchable, not
        # invalid — the matcher treats this as "no match".
        assert fingerprint_pcm(tone_pcm(0.5), 22050).values == ()

    def test_reports_the_library_version(self):
        version = library_version()
        assert version.count(".") >= 1


class TestFingerprintFailures:
    """libchromaprint's failure modes, which nothing else exercises."""

    def test_raises_when_the_library_refuses(self, tone_pcm, monkeypatch):
        import fingerprint_service.chromaprint_engine as engine

        monkeypatch.setattr(
            engine._lib, "chromaprint_get_raw_fingerprint", lambda *a: 0
        )
        with pytest.raises(FingerprintError, match="refused to produce"):
            fingerprint_pcm(tone_pcm(20.0), 22050)

    def test_wraps_an_unexpected_library_error(self, tone_pcm, monkeypatch):
        import fingerprint_service.chromaprint_engine as engine

        class Exploding:
            def start(self, *a):
                raise OSError("library went away")

        monkeypatch.setattr(engine._chromaprint, "Fingerprinter", Exploding)
        with pytest.raises(FingerprintError, match="chromaprint failed"):
            fingerprint_pcm(tone_pcm(20.0), 22050)


class TestFingerprintStream:
    """One pass over audio that arrives in pieces (#282)."""

    def test_chunked_equals_whole(self, tone_pcm):
        pcm = tone_pcm(30.0)
        chunks = [pcm[i : i + 4096] for i in range(0, len(pcm), 4096)]
        assert fingerprint_stream(chunks, 22050) == fingerprint_pcm(pcm, 22050)

    def test_a_source_failure_is_not_disguised_as_an_engine_one(self, tone_pcm):
        # A decode dying halfway must stay a decode error for the caller.
        class SourceBroke(RuntimeError):
            pass

        def chunks():
            yield tone_pcm(5.0)
            raise SourceBroke("ffmpeg died")

        with pytest.raises(SourceBroke):
            fingerprint_stream(chunks(), 22050)
