"""The seam between the ingest pipeline and whatever identifies the audio.

#271 settled the engine — Chromaprint, with a two-stage matcher: an inverted
index on the top 28 bits of each raw fingerprint value to generate candidates,
then an exact 32-bit bit-error-rate verify against the top 10, accepting
BER < 0.25. That lands in #278 as a second implementation of this protocol; the
library indexer (#277) reaches the same code through the same interface, so
neither path can drift from the other.

Nothing above this module knows which engine is in use.
"""
from typing import Protocol, runtime_checkable

from .audio import NormalizedAudio
from .config import logger
from .types import MatchCandidate


@runtime_checkable
class FingerprintMatcher(Protocol):
    """Answers "what does this window sound like", and nothing more.

    Deciding whether a track was *played* is aggregation across windows (#279),
    and belongs nowhere near here.
    """

    #: Engine name, recorded on every detection so a re-index under a new
    #: engine can be told apart from the old rows (`track_fingerprints`, #272).
    fingerprint_type: str
    #: Engine revision, same purpose.
    fingerprint_version: str

    def match(self, audio: NormalizedAudio) -> list[MatchCandidate]:
        """Zero or one candidate for this window. Empty means no match."""
        ...


class StubMatcher:
    """Matches nothing, so the pipeline can be exercised before #278 exists.

    Returning an empty list is the honest answer for a matcher with no index,
    and it is also a real case the rest of the pipeline must handle: a no-match
    window is recorded, not dropped, because a gap in matches is how #279 finds
    the boundary between one play and the next.

    `candidates` exists for tests and local end-to-end runs that need the
    populated shape to travel through the callback.
    """

    fingerprint_type = "stub"
    fingerprint_version = "0"

    def __init__(self, candidates: list[MatchCandidate] | None = None) -> None:
        self._candidates = list(candidates or [])

    def match(self, audio: NormalizedAudio) -> list[MatchCandidate]:
        logger.info(
            "Stub matcher saw %.2fs at %d Hz; returning %d candidate(s)",
            audio.duration_seconds,
            audio.sample_rate,
            len(self._candidates),
        )
        return list(self._candidates)


#: Registered implementations. #278 adds "chromaprint" here and changes the
#: FINGERPRINT_MATCHER default; nothing else in the service moves.
MATCHERS: dict[str, type] = {
    "stub": StubMatcher,
}


def build_matcher(name: str) -> FingerprintMatcher:
    """Construct the configured matcher, failing loudly on an unknown name."""
    try:
        factory = MATCHERS[name.strip().lower()]
    except KeyError:
        raise ValueError(
            f"unknown matcher {name!r}; available: {sorted(MATCHERS)}"
        ) from None
    return factory()
