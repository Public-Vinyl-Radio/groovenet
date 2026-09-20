import pytest
from fingerprint_service.audio import NormalizedAudio
from fingerprint_service.matcher import MATCHERS, FingerprintMatcher, StubMatcher, build_matcher


@pytest.fixture
def window():
    return NormalizedAudio(pcm=b"\x00\x00" * 22050, sample_rate=22050)


@pytest.fixture
def candidate():
    return {
        "track_id": "13916746-A6",
        "friend_id": 1,
        "confidence": 0.94,
        "offset_seconds": 12.4,
    }


class TestStubMatcher:
    def test_satisfies_the_protocol(self):
        assert isinstance(StubMatcher(), FingerprintMatcher)

    def test_names_its_engine_and_version(self):
        matcher = StubMatcher()
        assert matcher.fingerprint_type == "stub"
        assert matcher.fingerprint_version == "0"

    def test_matches_nothing_by_default(self, window):
        assert StubMatcher().match(window) == []

    def test_returns_the_configured_candidates(self, window, candidate):
        assert StubMatcher([candidate]).match(window) == [candidate]

    def test_hands_back_a_copy_so_callers_cannot_mutate_it(self, window, candidate):
        matcher = StubMatcher([candidate])
        matcher.match(window).append("junk")
        assert matcher.match(window) == [candidate]


class TestBuildMatcher:
    def test_builds_the_stub(self):
        assert isinstance(build_matcher("stub"), StubMatcher)

    @pytest.mark.parametrize("name", ["STUB", "  stub  "])
    def test_is_case_and_whitespace_insensitive(self, name):
        assert isinstance(build_matcher(name), StubMatcher)

    def test_rejects_an_unknown_matcher(self):
        with pytest.raises(ValueError, match="unknown matcher 'panako'"):
            build_matcher("panako")

    def test_every_registered_matcher_satisfies_the_protocol(self):
        for name in MATCHERS:
            assert isinstance(build_matcher(name), FingerprintMatcher)
