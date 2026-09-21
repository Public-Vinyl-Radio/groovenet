"""The in-memory reference index the live matcher searches (#278).

Two stages, as measured in #271:

1. **Candidate generation.** An inverted index over the **top 28 bits** of each
   value — the low four carry most of the noise a cartridge and a room add — but
   split into **two 14-bit halves, each indexed separately**, rather than keyed
   on all 28 at once. Each hit votes for a `(track, alignment)` pair, so stage 1
   hands stage 2 the offset it needs rather than a track alone.
2. **Verification.** Exact 32-bit bit-error rate against the top candidates
   only, at the alignment the votes proposed, and **only where the window and
   the reference overlap by at least `MIN_OVERLAP_VALUES`**. Cost is bounded by
   the candidate cap, not by the size of the library.

Both of those details are load-bearing, and were measured on the #271 corpus
(41 tracks, a 3-hour vinyl set, 736 windows, 788 held-out negative queries):

| stage 1 keying | verify overlap | recall | false positives |
| --- | --- | --- | --- |
| one 28-bit key | >= 1.0 s | 90.9% | 0 / 788 |
| two 14-bit keys | >= 1.0 s | 97.8% | 4 / 788 |
| **two 14-bit keys** | **>= 5.0 s** | **97.4%** | **0 / 788** |

Keying on all 28 bits at once looks safe and quietly loses a seventh of the
set. At a bit error rate of 0.23 — a real, confirmed match buried in a mix —
roughly 7 of 32 bits differ, so the odds that all 28 survive intact are about
0.1%: a 15-second window generates *no postings at all* and the track is never
even a candidate. That is how Massive Attack's "(Exchange)" went missing for
three minutes of a set it was definitely playing in. Splitting the key means a
value with a single damaged half still matches on the other.

The overlap floor is what pays for that. More candidates means more chances for
a handful of values to line up by luck, and without the floor those flukes cost
four false positives. Requiring a real overlap removes all four while keeping
almost all the recall, because a genuine match agrees over the whole window and
a coincidence does not.

Held in memory and rebuilt at startup from the stored per-track blobs: #271
measured ~28 MB of postings for 3,653 tracks and a 2.3 s rebuild, which is not
worth a table and a cache-invalidation problem.
"""
from collections import defaultdict
from dataclasses import dataclass

from .chromaprint_engine import SECONDS_PER_VALUE, RawFingerprint

#: Bits dropped from each value before indexing. #271: indexing all 32 bits cut
#: recall to 9 of 11 on real vinyl; the low bits are where the noise lands.
NOISE_BITS = 4

#: The remaining 28 bits are indexed as this many independent keys. Two 14-bit
#: halves: a value needs only one intact half to be found, which is what keeps
#: a degraded window from generating no postings at all. Three 9-bit thirds
#: measured no better and cost half again as many postings.
KEY_CHUNKS = 2
CHUNK_BITS = 14

#: How many (track, alignment) candidates survive stage 1. Stage 2 is linear in
#: this, so it — not library size — is what bounds worst-case latency.
DEFAULT_MAX_CANDIDATES = 10

#: A query must overlap the reference by at least this many values — about 5
#: seconds — before its bit error rate means anything. This is the guard that
#: makes the split key safe: without it the extra candidates produce four false
#: positives per 788 queries, all of them short alignments where a few values
#: agreed by chance.
MIN_OVERLAP_VALUES = 40


def index_keys(value: int) -> tuple[int, ...]:
    """The keys one fingerprint value is indexed under.

    Each is a (chunk number, chunk bits) pair packed into an int, so the halves
    cannot collide with one another.
    """
    mask = (1 << CHUNK_BITS) - 1
    shifted = value >> NOISE_BITS
    return tuple(
        (chunk << CHUNK_BITS) | ((shifted >> (CHUNK_BITS * chunk)) & mask)
        for chunk in range(KEY_CHUNKS)
    )


def _popcount_distance(a: int, b: int) -> int:
    return (a ^ b).bit_count()


@dataclass(frozen=True)
class TrackRef:
    """Which track a posting belongs to."""

    track_id: str
    friend_id: int


@dataclass(frozen=True)
class IndexMatch:
    """One verified candidate: what it is, how sure, and where in the track."""

    track: TrackRef
    #: 0.0 = every bit wrong, 1.0 = identical. `1 - bit_error_rate`.
    confidence: float
    bit_error_rate: float
    offset_seconds: float
    overlap_values: int


class ReferenceIndex:
    """Every reference fingerprint for one engine version, searchable."""

    def __init__(self, max_candidates: int = DEFAULT_MAX_CANDIDATES) -> None:
        self._postings: dict[int, list[tuple[int, int]]] = defaultdict(list)
        self._tracks: list[TrackRef] = []
        self._values: list[tuple[int, ...]] = []
        self.max_candidates = max_candidates

    def __len__(self) -> int:
        return len(self._tracks)

    @property
    def posting_count(self) -> int:
        return sum(len(p) for p in self._postings.values())

    def add(self, track: TrackRef, fingerprint: RawFingerprint) -> None:
        """Index one reference track.

        A track with no values — too short to fingerprint — is simply not
        indexed rather than rejected: it is unmatchable, not invalid.
        """
        if not fingerprint.values:
            return
        track_index = len(self._tracks)
        self._tracks.append(track)
        self._values.append(fingerprint.values)
        for position, value in enumerate(fingerprint.values):
            for key in index_keys(value):
                self._postings[key].append((track_index, position))

    def search(
        self,
        query: RawFingerprint,
        *,
        max_bit_error_rate: float,
        min_overlap: int = MIN_OVERLAP_VALUES,
    ) -> list[IndexMatch]:
        """Best match for one window, or nothing.

        Returns a list because the interface above it is list-shaped (#278), but
        it holds at most one entry: the single best alignment that clears the
        error-rate floor.
        """
        if not query.values or not self._tracks:
            return []

        proposals = self._vote(query)
        if not proposals:
            return []

        best: IndexMatch | None = None
        for track_index, alignment in proposals:
            verified = self._verify(track_index, alignment, query, min_overlap)
            if verified is None:
                continue
            if best is None or verified.bit_error_rate < best.bit_error_rate:
                best = verified

        if best is None or best.bit_error_rate >= max_bit_error_rate:
            return []
        return [best]

    def _vote(self, query: RawFingerprint) -> list[tuple[int, int]]:
        """Stage 1 — the `(track, alignment)` pairs worth verifying.

        `alignment` is where in the reference this window would start, in
        values: a posting at reference position `p` matching query position `q`
        argues the window begins at `p - q`. Agreement on that difference is
        what separates a real match from scattered coincidental hits.
        """
        votes: dict[tuple[int, int], int] = defaultdict(int)
        for query_position, value in enumerate(query.values):
            for key in index_keys(value):
                for track_index, position in self._postings.get(key, ()):
                    votes[(track_index, position - query_position)] += 1

        if not votes:
            return []

        ranked = sorted(votes.items(), key=lambda item: item[1], reverse=True)
        return [pair for pair, _ in ranked[: self.max_candidates]]

    def _verify(
        self,
        track_index: int,
        alignment: int,
        query: RawFingerprint,
        min_overlap: int,
    ) -> IndexMatch | None:
        """Stage 2 — exact bit error rate over the overlapping values."""
        reference = self._values[track_index]

        start = max(alignment, 0)
        query_start = start - alignment
        overlap = min(len(reference) - start, len(query.values) - query_start)
        if overlap < min_overlap:
            return None

        errors = 0
        for i in range(overlap):
            errors += _popcount_distance(reference[start + i], query.values[query_start + i])

        bit_error_rate = errors / (overlap * 32)
        return IndexMatch(
            track=self._tracks[track_index],
            confidence=1.0 - bit_error_rate,
            bit_error_rate=bit_error_rate,
            # Where the *window* starts in the reference, which is what a
            # listener means by "how far into the track are we".
            offset_seconds=max(alignment, 0) * SECONDS_PER_VALUE,
            overlap_values=overlap,
        )
