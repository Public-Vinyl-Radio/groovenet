"""ChromaprintMatcher — both directions of the engine (#278)."""
import pytest
from fingerprint_service.audio import NormalizedAudio
from fingerprint_service.chromaprint_engine import RawFingerprint, fingerprint_pcm
from fingerprint_service.matcher import (
    ChromaprintMatcher,
    FingerprintMatcher,
    build_matcher,
)
from fingerprint_service.reference_index import ReferenceIndex, TrackRef


def audio_of(tone_pcm, seconds=30.0, seed=1.0, noise=0.0):
    return NormalizedAudio(
        pcm=tone_pcm(seconds, seed=seed, noise=noise), sample_rate=22050
    )


class TestProtocol:
    def test_satisfies_the_matcher_protocol(self):
        assert isinstance(ChromaprintMatcher(), FingerprintMatcher)

    def test_is_registered_under_its_engine_name(self):
        assert isinstance(build_matcher("chromaprint"), ChromaprintMatcher)

    def test_reports_its_engine_and_version(self):
        matcher = ChromaprintMatcher()
        assert matcher.fingerprint_type == "chromaprint"
        assert matcher.fingerprint_version

    def test_the_version_is_not_the_library_version(self):
        """Keying on libchromaprint's version would empty the index on upgrade.

        1.5.1 (Debian, in the image) and 1.6.1 (Homebrew, on a dev Mac) emit
        byte-identical fingerprints, so tying the stored version to the library
        would mean a base-image bump left the matcher hunting for a version
        nothing was indexed under — matching nothing at all until a full
        re-index finished.
        """
        from fingerprint_service.chromaprint_engine import library_version

        assert ChromaprintMatcher().fingerprint_version != library_version()


class TestIndexDirection:
    def test_fingerprints_a_reference_track(self, tone_pcm):
        blob = ChromaprintMatcher().index(audio_of(tone_pcm, seconds=60.0))

        assert blob is not None
        assert len(blob) % 4 == 0
        assert len(RawFingerprint.from_bytes(blob).values) > 100

    def test_returns_none_for_audio_too_short_to_fingerprint(self, tone_pcm):
        assert ChromaprintMatcher().index(audio_of(tone_pcm, seconds=0.5)) is None

    def test_what_it_indexes_is_what_it_searches(self, tone_pcm):
        """The reason both directions live on one class.

        An index built by one implementation and queried by another would be
        silently, unfixably wrong — so the stored blob has to be exactly what
        `match` later compares against.
        """
        matcher = ChromaprintMatcher()
        reference = audio_of(tone_pcm, seconds=60.0)
        blob = matcher.index(reference)

        index = ReferenceIndex()
        index.add(TrackRef("t1", 1), RawFingerprint.from_bytes(blob))
        matcher.reference_index = index

        excerpt = NormalizedAudio(
            pcm=reference.pcm[22050 * 2 * 10 : 22050 * 2 * 28], sample_rate=22050
        )
        assert matcher.match(excerpt)[0]["track_id"] == "t1"


class TestMatchDirection:
    def build(self, tone_pcm, seeds=(1.0, 2.3, 3.7)):
        matcher = ChromaprintMatcher()
        index = ReferenceIndex()
        for i, seed in enumerate(seeds, start=1):
            index.add(
                TrackRef(f"t{i}", i),
                fingerprint_pcm(tone_pcm(60.0, seed=seed), 22050),
            )
        matcher.reference_index = index
        return matcher

    def test_returns_the_candidate_shape_the_callback_expects(self, tone_pcm):
        matcher = self.build(tone_pcm)
        window = audio_of(tone_pcm, seconds=30.0, seed=2.3)

        candidates = matcher.match(window)

        assert len(candidates) == 1
        assert set(candidates[0]) == {
            "track_id",
            "friend_id",
            "confidence",
            "offset_seconds",
        }
        assert candidates[0]["track_id"] == "t2"
        assert candidates[0]["friend_id"] == 2

    def test_confidence_is_between_zero_and_one(self, tone_pcm):
        matcher = self.build(tone_pcm)
        candidate = matcher.match(audio_of(tone_pcm, seconds=30.0, seed=2.3))[0]
        assert 0.0 <= candidate["confidence"] <= 1.0

    def test_reports_an_offset_into_the_track(self, tone_pcm):
        matcher = self.build(tone_pcm)
        full = tone_pcm(60.0, seed=2.3)
        # A window taken 20s in should report roughly 20s.
        window = NormalizedAudio(
            pcm=full[22050 * 2 * 20 : 22050 * 2 * 38], sample_rate=22050
        )

        candidate = matcher.match(window)[0]

        assert candidate["offset_seconds"] == pytest.approx(20.0, abs=1.5)

    def test_unknown_audio_returns_no_candidates(self, tone_pcm):
        matcher = self.build(tone_pcm)
        assert matcher.match(audio_of(tone_pcm, seconds=30.0, seed=9.1)) == []

    def test_silence_returns_no_candidates(self, tone_pcm):
        """A required behaviour, not an edge case (#278).

        A window of silence or pure surface noise must produce nothing rather
        than a spurious low-confidence guess — #279 counts one detection as a
        play, with nothing to corroborate it.
        """
        matcher = self.build(tone_pcm)
        silence = NormalizedAudio(pcm=b"\x00\x00" * 22050 * 20, sample_rate=22050)
        assert matcher.match(silence) == []

    def test_an_empty_index_matches_nothing(self, tone_pcm):
        # The real state before library indexing has run (#277).
        assert ChromaprintMatcher().match(audio_of(tone_pcm)) == []

    def test_audio_too_short_to_fingerprint_matches_nothing(self, tone_pcm):
        matcher = self.build(tone_pcm)
        assert matcher.match(audio_of(tone_pcm, seconds=0.5)) == []

    def test_never_decodes_reference_audio_at_match_time(self, tone_pcm, monkeypatch):
        """#278's hard rule: query the index, never the library.

        If a track has no fingerprint it is simply not a candidate.
        """
        matcher = self.build(tone_pcm)

        def explode(*args, **kwargs):
            raise AssertionError("match must not decode audio from disk")

        monkeypatch.setattr("fingerprint_service.audio.decode_to_pcm", explode)
        matcher.match(audio_of(tone_pcm, seconds=30.0, seed=2.3))

    def test_the_threshold_is_honoured(self, tone_pcm):
        strict = self.build(tone_pcm)
        strict.max_bit_error_rate = 0.0001
        assert strict.match(audio_of(tone_pcm, seconds=30.0, seed=2.3, noise=0.2)) == []
