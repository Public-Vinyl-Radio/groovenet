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

Held in memory and rebuilt at startup from the stored per-track blobs, as
**flat numpy arrays** rather than Python containers (#315). The information is
small — ~7.6M 32-bit values for ~3,900 tracks, about 30 MB — but a dict of
lists of `(track, position)` tuples spent 70-100 bytes per 4-byte posting and
reached 1.6-1.8 GiB. Packed, the postings are one `uint32` per entry.

Layout, for `n` reference values across all tracks:

- `_values` — every reference value, tracks concatenated (`n` x uint32).
- `_bounds` — where each track starts in `_values`, plus a final sentinel.
- `_postings` — for every value and key half, the value's position in
  `_values`, grouped by key (`KEY_CHUNKS * n` x uint32).
- `_keys` / `_offsets` — the distinct keys, sorted, and where each one's run
  of postings starts. Sparse on purpose: a dense table would need 2^28 slots
  if the key were ever keyed on all 28 bits again.

Search behaviour is identical to the tuple-based index it replaced, down to
how ties are broken — so every measured number above still holds.
"""
from dataclasses import dataclass

import numpy as np

from .chromaprint_engine import SECONDS_PER_VALUE, FingerprintError, RawFingerprint

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
    cannot collide with one another. `_keys_of` is the same rule over an array.
    """
    mask = (1 << CHUNK_BITS) - 1
    shifted = value >> NOISE_BITS
    return tuple(
        (chunk << CHUNK_BITS) | ((shifted >> (CHUNK_BITS * chunk)) & mask)
        for chunk in range(KEY_CHUNKS)
    )


def _keys_of(values: np.ndarray) -> np.ndarray:
    """`index_keys` for every value at once: shape (KEY_CHUNKS, len(values))."""
    mask = np.uint32((1 << CHUNK_BITS) - 1)
    shifted = values >> np.uint32(NOISE_BITS)
    return np.stack(
        [
            np.uint32(chunk << CHUNK_BITS)
            | ((shifted >> np.uint32(CHUNK_BITS * chunk)) & mask)
            for chunk in range(KEY_CHUNKS)
        ]
    )


#: A (track, alignment) pair packed into one int64 so candidates can be counted
#: with a single `np.unique`. Alignment goes negative when a window starts
#: before its reference does, hence the bias.
_ALIGNMENT_BITS = 32
_ALIGNMENT_BIAS = 1 << 31


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
        self._tracks: list[TrackRef] = []
        #: Tracks added since the arrays were last built. `add` only queues;
        #: the arrays are rebuilt once, on the next search, so loading a
        #: library is one sort rather than one per track.
        self._pending: list[np.ndarray] = []
        self._values = np.empty(0, dtype=np.uint32)
        self._bounds = np.zeros(1, dtype=np.int64)
        self._postings = np.empty(0, dtype=np.uint32)
        self._keys = np.empty(0, dtype=np.uint32)
        self._offsets = np.zeros(1, dtype=np.int64)
        self.max_candidates = max_candidates

    def __len__(self) -> int:
        return len(self._tracks)

    @property
    def posting_count(self) -> int:
        self._build()
        return len(self._postings)

    def add(self, track: TrackRef, fingerprint: RawFingerprint) -> None:
        """Index one reference track.

        A track with no values — too short to fingerprint — is simply not
        indexed rather than rejected: it is unmatchable, not invalid.
        """
        self._queue(track, np.asarray(fingerprint.values, dtype=np.uint32))

    def add_blob(self, track: TrackRef, blob: bytes) -> None:
        """`add`, straight from the stored little-endian bytes.

        What the loader uses. Going through `RawFingerprint` would build a
        Python int per value — millions of short-lived objects for a whole
        library, and allocator arenas the process keeps long after.
        """
        if len(blob) % 4 != 0:
            raise FingerprintError(
                f"fingerprint blob is {len(blob)} bytes, not a whole number of uint32s"
            )
        self._queue(track, np.frombuffer(blob, dtype="<u4").astype(np.uint32))

    def _queue(self, track: TrackRef, values: np.ndarray) -> None:
        if len(values) == 0:
            return
        self._tracks.append(track)
        self._pending.append(values)

    def _build(self) -> None:
        """Fold pending tracks into the arrays, rebuilding the postings.

        Postings are grouped by key with a *stable* sort over values laid out
        in track order, so within one key they run in the same order the
        tuple-based index appended them. `_vote` breaks ties on that order.
        """
        if not self._pending:
            return
        lengths = [len(values) for values in self._pending]
        self._values = np.concatenate([self._values, *self._pending])
        self._bounds = np.concatenate(
            [self._bounds, self._bounds[-1] + np.cumsum(lengths, dtype=np.int64)]
        )
        self._pending = []

        # Chunk-major, so each key's run comes from one chunk and stays in
        # ascending position order through the stable sort.
        keys = _keys_of(self._values).ravel()
        order = np.argsort(keys, kind="stable")
        positions = np.arange(len(self._values), dtype=np.uint32)
        self._postings = np.tile(positions, KEY_CHUNKS)[order]
        self._keys, counts = np.unique(keys[order], return_counts=True)
        self._offsets = np.concatenate([[0], np.cumsum(counts, dtype=np.int64)])

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
        self._build()

        values = np.asarray(query.values, dtype=np.uint32)
        proposals = self._vote(values)
        if not proposals:
            return []

        best: IndexMatch | None = None
        for track_index, alignment in proposals:
            verified = self._verify(track_index, alignment, values, min_overlap)
            if verified is None:
                continue
            if best is None or verified.bit_error_rate < best.bit_error_rate:
                best = verified

        if best is None or best.bit_error_rate >= max_bit_error_rate:
            return []
        return [best]

    def _tally(
        self, query: np.ndarray
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Stage 1 votes: distinct packed pairs, their counts, first sighting.

        `alignment` is where in the reference this window would start, in
        values: a posting at reference position `p` matching query position `q`
        argues the window begins at `p - q`. Agreement on that difference is
        what separates a real match from scattered coincidental hits.

        Postings are gathered in the order the tuple-based index visited them
        — query position, then key half, then posting — so "first sighting"
        means the same thing it did there.
        """
        self._build()
        empty = np.empty(0, dtype=np.int64)
        if len(self._keys) == 0:
            return empty, empty, empty

        query_keys = _keys_of(query).T.ravel()
        query_positions = np.repeat(np.arange(len(query), dtype=np.int64), KEY_CHUNKS)

        slots = np.searchsorted(self._keys, query_keys)
        clipped = np.minimum(slots, len(self._keys) - 1)
        found = (slots < len(self._keys)) & (self._keys[clipped] == query_keys)
        starts = self._offsets[clipped[found]]
        lengths = self._offsets[clipped[found] + 1] - starts
        total = int(lengths.sum())
        if total == 0:
            return empty, empty, empty

        # Concatenate every matched key's run of postings without a loop.
        run_starts = np.cumsum(lengths) - lengths
        gather = np.arange(total, dtype=np.int64) + np.repeat(starts - run_starts, lengths)
        positions = self._postings[gather].astype(np.int64)
        query_at = np.repeat(query_positions[found], lengths)

        tracks = np.searchsorted(self._bounds, positions, side="right") - 1
        alignments = positions - self._bounds[tracks] - query_at
        pairs = (tracks << _ALIGNMENT_BITS) + (alignments + _ALIGNMENT_BIAS)
        distinct, first, counts = np.unique(pairs, return_index=True, return_counts=True)
        return distinct, counts, first

    def _vote(self, query: np.ndarray) -> list[tuple[int, int]]:
        """Stage 1 — the `(track, alignment)` pairs worth verifying.

        Most votes first; a tie goes to the pair seen first, exactly as a
        stable sort over insertion order did before.
        """
        pairs, counts, first = self._tally(query)
        if len(pairs) == 0:
            return []
        ranked = pairs[np.lexsort((first, -counts))[: self.max_candidates]]
        return [
            (int(pair >> _ALIGNMENT_BITS), int(pair & 0xFFFFFFFF) - _ALIGNMENT_BIAS)
            for pair in ranked
        ]

    def _verify(
        self,
        track_index: int,
        alignment: int,
        query: np.ndarray,
        min_overlap: int,
    ) -> IndexMatch | None:
        """Stage 2 — exact bit error rate over the overlapping values."""
        track_start = int(self._bounds[track_index])
        track_length = int(self._bounds[track_index + 1]) - track_start

        start = max(alignment, 0)
        query_start = start - alignment
        overlap = min(track_length - start, len(query) - query_start)
        if overlap < min_overlap:
            return None

        reference = self._values[track_start + start : track_start + start + overlap]
        window = query[query_start : query_start + overlap]
        errors = int(np.bitwise_count(reference ^ window).sum())

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
