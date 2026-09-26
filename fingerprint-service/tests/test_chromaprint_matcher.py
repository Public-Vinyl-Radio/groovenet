"""ChromaprintMatcher — both directions of the engine (#278)."""
import pytest
from fingerprint_service.audio import NormalizedAudio
from fingerprint_service.chromaprint_engine import RawFingerprint, fingerprint_pcm
from fingerprint_service.matcher import (
    ChromaprintMatcher,
    FingerprintMatcher,
    StubMatcher,
    build_matcher,
    window_spans,
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


def side_rip_pcm(tone_pcm, seed=1.0, music_seconds=30.0, silence_seconds=20.0, sample_rate=22050):
    """PCM shaped like a real side rip: music, a silent gap, then music again.

    The same seed on both sides — the silence is a gap in one track, not a
    boundary between two different ones.
    """
    music = tone_pcm(music_seconds, seed=seed)
    silence = b"\x00\x00" * int(silence_seconds * sample_rate)
    return music + silence + music


def silent_window(seconds=15.0, sample_rate=22050):
    return NormalizedAudio(pcm=b"\x00\x00" * int(seconds * sample_rate), sample_rate=sample_rate)


class TestSilenceRefusal:
    """#306: a window with almost no signal must never match — even when the
    reference library itself contains silence.

    Reference tracks are full-side rips, so a silent gap is normal. Chromaprint
    fingerprints two silences identically (a true bit-error-rate of 0.0), so no
    BER threshold can tell a live silent window apart from the reference's own
    silent gap. The old `test_silence_returns_no_candidates` built an index of
    only tonal references, so silence had nothing to match and the test proved
    nothing — these replace it with an index that actually contains silence.
    """

    def build_with_side_rip(self, tone_pcm, seed=1.0, music_seconds=30.0, silence_seconds=20.0):
        matcher = ChromaprintMatcher()
        pcm = side_rip_pcm(
            tone_pcm, seed=seed, music_seconds=music_seconds, silence_seconds=silence_seconds
        )
        index = ReferenceIndex()
        index.add(TrackRef("t1", 1), fingerprint_pcm(pcm, 22050))
        matcher.reference_index = index
        return matcher

    def test_silence_returns_no_candidates_even_when_the_library_contains_silence(self, tone_pcm):
        matcher = self.build_with_side_rip(tone_pcm)
        assert matcher.match(silent_window()) == []

    def test_without_the_check_the_same_window_matches_at_high_confidence(self, tone_pcm):
        """Demonstrates the bug this fixes.

        Disabling the gate lets the exact same silent window match the
        reference's own silent gap — the failure seen in production.
        """
        matcher = self.build_with_side_rip(tone_pcm)
        matcher.min_variety = 0.0

        candidates = matcher.match(silent_window())

        assert len(candidates) == 1
        assert candidates[0]["confidence"] > 0.99

    def test_a_near_silent_window_is_also_refused(self, tone_pcm):
        """A real noise floor, not mathematical zero, must be refused too.

        Modelled as quiet mains hum rather than independent random noise per
        sample: a turntable or amp's actual noise floor is a low-amplitude,
        *steady* signal — it does not move spectrally frame to frame any more
        than true silence does. (Full-bandwidth Gaussian noise is the opposite
        case: even very quiet, it re-randomises every frame and reads as high
        variety, i.e. it isn't the failure mode this check is for.)
        """
        import math
        import struct

        sample_rate = 22050
        hum_pcm = b"".join(
            struct.pack("<h", int(30 * math.sin(2 * math.pi * 60.0 * i / sample_rate)))
            for i in range(int(15.0 * sample_rate))
        )

        # Sanity check: this really is near-silent by the same measure the
        # matcher uses, not merely low-amplitude by construction.
        assert fingerprint_pcm(hum_pcm, sample_rate).variety < 0.20

        matcher = self.build_with_side_rip(tone_pcm)
        assert matcher.match(NormalizedAudio(pcm=hum_pcm, sample_rate=sample_rate)) == []

    def test_real_music_still_matches_with_unchanged_confidence(self, tone_pcm):
        matcher = self.build_with_side_rip(tone_pcm, seed=2.3)
        window = audio_of(tone_pcm, seconds=20.0, seed=2.3)

        candidates = matcher.match(window)

        assert len(candidates) == 1
        assert candidates[0]["track_id"] == "t1"
        assert candidates[0]["confidence"] > 0.9

    def test_setting_the_floor_to_zero_restores_the_old_behaviour(self, tone_pcm):
        matcher = self.build_with_side_rip(tone_pcm)
        assert matcher.match(silent_window()) == []

        matcher.min_variety = 0.0

        assert matcher.match(silent_window()) != []


def chunked(pcm: bytes, size: int = 8192) -> list[bytes]:
    return [pcm[i : i + size] for i in range(0, len(pcm), size)]


class TestWindowSpans:
    def test_back_to_back_windows(self):
        assert window_spans(30, 10, 10, minimum=1) == [(0, 10), (10, 20), (20, 30)]

    def test_keeps_a_tail_long_enough_to_search(self):
        assert window_spans(25, 10, 10, minimum=5) == [(0, 10), (10, 20), (20, 25)]

    def test_drops_a_tail_too_short_to_search(self):
        assert window_spans(24, 10, 10, minimum=5) == [(0, 10), (10, 20)]

    def test_overlapping_windows(self):
        assert window_spans(20, 10, 5, minimum=10) == [(0, 10), (5, 15), (10, 20)]

    def test_nothing_to_cut(self):
        assert window_spans(0, 10, 10, minimum=1) == []


class TestMatchRecording:
    """Fingerprint once, slice many (#282)."""

    def index_of(self, tone_pcm, seeds):
        index = ReferenceIndex()
        for seed in seeds:
            index.add(TrackRef(f"seed-{seed}", 1), fingerprint_pcm(tone_pcm(40.0, seed=seed), 22050))
        return index

    def test_names_each_record_in_turn(self, tone_pcm):
        index = self.index_of(tone_pcm, (1.0, 2.3))
        recording = tone_pcm(40.0, seed=1.0) + tone_pcm(40.0, seed=2.3)

        windows = ChromaprintMatcher(index=index).match_recording(
            chunked(recording), 22050, window_seconds=15, step_seconds=15
        )

        named = [w["candidates"][0]["track_id"] if w["candidates"] else None for w in windows]
        assert named[:2] == ["seed-1.0", "seed-1.0"]
        assert named[-1] == "seed-2.3"

    def test_windows_carry_their_place_in_the_recording(self, tone_pcm):
        windows = ChromaprintMatcher(index=self.index_of(tone_pcm, (1.0,))).match_recording(
            chunked(tone_pcm(40.0, seed=1.0)), 22050, window_seconds=15, step_seconds=15
        )

        assert [w["start_seconds"] for w in windows] == pytest.approx([0.0, 15.0, 30.0], abs=0.1)
        assert windows[0]["duration_seconds"] == pytest.approx(15.0, abs=0.1)
        assert windows[-1]["duration_seconds"] < 15.0

    def test_the_offset_advances_with_the_recording(self, tone_pcm):
        """The corroboration #282 leans on: wall clock and track clock agree."""
        windows = ChromaprintMatcher(index=self.index_of(tone_pcm, (1.0,))).match_recording(
            chunked(tone_pcm(40.0, seed=1.0)), 22050, window_seconds=10, step_seconds=10
        )

        offsets = [w["candidates"][0]["offset_seconds"] for w in windows if w["candidates"]]
        starts = [w["start_seconds"] for w in windows if w["candidates"]]
        assert offsets == pytest.approx(starts, abs=0.5)

    def test_unknown_audio_is_kept_as_unidentified_windows(self, tone_pcm):
        windows = ChromaprintMatcher(index=self.index_of(tone_pcm, (1.0,))).match_recording(
            chunked(tone_pcm(30.0, seed=9.1)), 22050, window_seconds=15, step_seconds=15
        )

        assert len(windows) == 2
        assert all(w["candidates"] == [] for w in windows)

    def test_an_empty_index_warns_and_matches_nothing(self, tone_pcm, caplog):
        windows = ChromaprintMatcher().match_recording(
            chunked(tone_pcm(20.0)), 22050, window_seconds=15, step_seconds=15
        )

        assert windows and all(w["candidates"] == [] for w in windows)
        assert "every window will be unidentified" in caplog.text

    def test_silence_is_refused_per_window(self, tone_pcm):
        index = self.index_of(tone_pcm, (1.0,))
        recording = tone_pcm(20.0, seed=1.0) + b"\x00\x00" * 22050 * 20

        windows = ChromaprintMatcher(index=index).match_recording(
            chunked(recording), 22050, window_seconds=10, step_seconds=10
        )

        assert windows[0]["candidates"]
        assert windows[-1]["candidates"] == []


class TestStubMatchRecording:
    def test_cuts_windows_by_time(self):
        candidate = {"track_id": "t1", "friend_id": 1, "confidence": 0.9, "offset_seconds": 0.0}
        pcm = b"\x00\x00" * 22050 * 20

        windows = StubMatcher(candidates=[candidate]).match_recording(
            chunked(pcm), 22050, window_seconds=15, step_seconds=15
        )

        assert [(w["start_seconds"], w["duration_seconds"]) for w in windows] == [(0.0, 15.0), (15.0, 5.0)]
        assert windows[0]["candidates"] == [candidate]
