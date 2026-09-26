"""The seam between the ingest pipeline and whatever identifies the audio.

#271 settled the engine — Chromaprint, with a two-stage matcher: an inverted
index on the top 28 bits of each raw fingerprint value to generate candidates,
then an exact 32-bit bit-error-rate verify against the top 10, accepting
BER < 0.25. That lands in #278 as a second implementation of this protocol; the
library indexer (#277) reaches the same code through the same interface, so
neither path can drift from the other.

Nothing above this module knows which engine is in use.
"""
from collections.abc import Iterable
from typing import Protocol, runtime_checkable

from .audio import BYTES_PER_SAMPLE, NormalizedAudio
from .chromaprint_engine import (
    SECONDS_PER_VALUE,
    RawFingerprint,
    fingerprint_pcm,
    fingerprint_stream,
)
from .config import (
    FINGERPRINT_VERSION,
    MAX_BIT_ERROR_RATE,
    MIN_FINGERPRINT_VARIETY,
    logger,
)
from .reference_index import MIN_OVERLAP_VALUES, ReferenceIndex
from .types import MatchCandidate, WindowMatch


@runtime_checkable
class FingerprintMatcher(Protocol):
    """Both directions of one engine: build an index entry, and query it.

    Deciding whether a track was *played* is aggregation across windows (#279),
    and belongs nowhere near here.
    """

    #: Engine name, recorded on every detection so a re-index under a new
    #: engine can be told apart from the old rows (`track_fingerprints`, #272).
    fingerprint_type: str
    #: Engine revision, same purpose.
    fingerprint_version: str

    def index(self, audio: NormalizedAudio) -> bytes | None:
        """Fingerprint a whole reference track, for storage.

        The inverse of `match`, and the reason the library indexer (#277) needs
        nothing of its own: whatever an engine emits here is exactly what it
        will later search, so the index cannot be built by one implementation
        and queried by another.

        `None` means the engine has no payload to store — honest for a stub,
        and `track_fingerprints.fingerprint_data` is nullable for it.
        """
        ...

    def match(self, audio: NormalizedAudio) -> list[MatchCandidate]:
        """Zero or one candidate for this window. Empty means no match."""
        ...

    def match_recording(
        self,
        pcm_chunks: Iterable[bytes],
        sample_rate: int,
        *,
        window_seconds: float,
        step_seconds: float,
    ) -> list[WindowMatch]:
        """Every window of a whole recording, matched (#282).

        Why this is not `match` in a loop: an engine can analyse the recording
        once and cut windows from the result, rather than decoding and
        fingerprinting each window from scratch — #271 measured 10 s against
        ~13 minutes for a three-hour set. How it cuts them is the engine's
        business; the windows it returns are the contract.
        """
        ...


def window_spans(
    total: int, window: int, step: int, minimum: int
) -> list[tuple[int, int]]:
    """`(start, end)` spans over `total` units, keeping a short tail.

    A trailing window shorter than `window` is kept as long as it has at least
    `minimum` units — the end of a set is as much a part of it as the middle.
    """
    spans = []
    for start in range(0, total, step):
        end = min(start + window, total)
        if end - start < minimum:
            break
        spans.append((start, end))
    return spans


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

    def index(self, audio: NormalizedAudio) -> bytes | None:
        """Store nothing, but prove the whole indexing path runs end to end.

        Returning `None` rather than a fake payload keeps the row honest: it
        records that this track was decoded and hashed under this engine and
        version, which is all the skip/regenerate logic in #277 needs, and
        leaves no synthetic bytes for #278 to mistake for a real fingerprint.
        """
        logger.info(
            "Stub matcher indexed %.2fs at %d Hz; storing no payload",
            audio.duration_seconds,
            audio.sample_rate,
        )
        return None

    def match(self, audio: NormalizedAudio) -> list[MatchCandidate]:
        logger.info(
            "Stub matcher saw %.2fs at %d Hz; returning %d candidate(s)",
            audio.duration_seconds,
            audio.sample_rate,
            len(self._candidates),
        )
        return list(self._candidates)

    def match_recording(
        self,
        pcm_chunks: Iterable[bytes],
        sample_rate: int,
        *,
        window_seconds: float,
        step_seconds: float,
    ) -> list[WindowMatch]:
        """Cut windows by time and give each the stub's fixed answer."""
        samples = sum(len(chunk) for chunk in pcm_chunks) // BYTES_PER_SAMPLE
        window = round(window_seconds * sample_rate)
        step = round(step_seconds * sample_rate)
        return [
            {
                "start_seconds": round(start / sample_rate, 2),
                "duration_seconds": round((end - start) / sample_rate, 2),
                "candidates": list(self._candidates),
            }
            for start, end in window_spans(samples, window, step, minimum=1)
        ]


class ChromaprintMatcher:
    """Chromaprint, searched two-stage against an in-memory index (#278).

    Both halves of one engine. `index` fingerprints a whole reference track for
    storage; `match` fingerprints a 15-second window and searches what `index`
    produced. They share `fingerprint_pcm`, so the index cannot be built by one
    implementation and queried by another.

    The index is injected rather than loaded here: this service has no database
    connection by design (#273), so `reference_loader` fetches the stored blobs
    over the app's REST API and hands them in. A matcher with an empty index is
    a legitimate state — nothing has been indexed yet (#277) — and answers "no
    match" rather than failing.

    A query is also refused before it ever reaches the index if it has too
    little spectral variety (#306). Reference tracks are full-side rips, so a
    silent gap is normal, not exceptional — and Chromaprint fingerprints two
    silences identically, a true bit-error-rate of 0.0 that no BER threshold
    can distinguish from a real match. Checked here, on the query, rather than
    at index time: the reference library legitimately contains silence, and
    refusing to *store* it would not stop a live silent window from finding it.
    """

    fingerprint_type = "chromaprint"

    def __init__(
        self,
        index: ReferenceIndex | None = None,
        max_bit_error_rate: float = MAX_BIT_ERROR_RATE,
        min_variety: float = MIN_FINGERPRINT_VARIETY,
    ) -> None:
        self.reference_index = index if index is not None else ReferenceIndex()
        self.max_bit_error_rate = max_bit_error_rate
        self.min_variety = min_variety
        # Our recipe's version, not libchromaprint's — see FINGERPRINT_VERSION.
        # Two library versions that emit identical bytes must index under the
        # same name, or upgrading the base image empties the index.
        self.fingerprint_version = FINGERPRINT_VERSION

    def index(self, audio: NormalizedAudio) -> bytes | None:
        fingerprint = fingerprint_pcm(audio.pcm, audio.sample_rate)
        if not fingerprint.values:
            # Chromaprint needs a few seconds before it emits anything. Too
            # short to fingerprint is unmatchable, not invalid.
            logger.warning(
                "Audio of %.2fs produced no fingerprint values", audio.duration_seconds
            )
            return None
        return fingerprint.to_bytes()

    def match(self, audio: NormalizedAudio) -> list[MatchCandidate]:
        if len(self.reference_index) == 0:
            logger.warning("Reference index is empty; nothing can match")
            return []

        candidates = self._search(fingerprint_pcm(audio.pcm, audio.sample_rate))
        if candidates:
            logger.info(
                "Matched track %s at %.1fs (confidence %.3f)",
                candidates[0]["track_id"],
                candidates[0]["offset_seconds"],
                candidates[0]["confidence"],
            )
        else:
            logger.info(
                "No match for %.2fs window against %d track(s)",
                audio.duration_seconds,
                len(self.reference_index),
            )
        return candidates

    def match_recording(
        self,
        pcm_chunks: Iterable[bytes],
        sample_rate: int,
        *,
        window_seconds: float,
        step_seconds: float,
    ) -> list[WindowMatch]:
        """Fingerprint the whole recording once, then search a slice per window.

        Slicing the fingerprint rather than the audio also avoids Chromaprint's
        lead-in on every window: a freshly fingerprinted 15 s window loses its
        first ~2.6 s, a slice loses nothing. Times are value index x
        SECONDS_PER_VALUE, the same clock `offset_seconds` uses.
        """
        if len(self.reference_index) == 0:
            # Say so loudly: a derivation against no index is all-unidentified,
            # which would read as a set of records outside the library.
            logger.warning("Reference index is empty; every window will be unidentified")

        recording = fingerprint_stream(pcm_chunks, sample_rate)
        window = max(1, round(window_seconds / SECONDS_PER_VALUE))
        step = max(1, round(step_seconds / SECONDS_PER_VALUE))

        windows: list[WindowMatch] = []
        for start, end in window_spans(
            len(recording.values), window, step, minimum=MIN_OVERLAP_VALUES
        ):
            windows.append(
                {
                    "start_seconds": round(start * SECONDS_PER_VALUE, 2),
                    "duration_seconds": round((end - start) * SECONDS_PER_VALUE, 2),
                    "candidates": self._search(
                        RawFingerprint(recording.values[start:end])
                    ),
                }
            )

        logger.info(
            "Matched %d of %d window(s) across %.0fs of recording",
            sum(1 for w in windows if w["candidates"]),
            len(windows),
            recording.duration_seconds,
        )
        return windows

    def _search(self, query: RawFingerprint) -> list[MatchCandidate]:
        """One fingerprinted window against the index, through the silence gate."""
        if not query.values or len(self.reference_index) == 0:
            return []

        if query.variety < self.min_variety:
            # Not a BER problem: two silences fingerprint identically, so
            # nothing downstream can tell this apart from a real match.
            logger.debug(
                "Window has too little variety (%.3f < %.2f) to search — "
                "likely silence or surface noise",
                query.variety,
                self.min_variety,
            )
            return []

        matches = self.reference_index.search(
            query, max_bit_error_rate=self.max_bit_error_rate
        )
        if not matches:
            return []

        best = matches[0]
        return [
            {
                "track_id": best.track.track_id,
                "friend_id": best.track.friend_id,
                "confidence": round(best.confidence, 4),
                "offset_seconds": round(best.offset_seconds, 2),
            }
        ]


#: Registered implementations. `FINGERPRINT_MATCHER` picks one; nothing else in
#: the service knows which is in use.
MATCHERS: dict[str, type] = {
    "stub": StubMatcher,
    "chromaprint": ChromaprintMatcher,
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
