"""The two-stage reference index (#278).

The design decisions here were measured on the #271 corpus and are recorded in
the module docstring; these tests pin the behaviour those measurements bought,
using synthetic audio so they run anywhere.
"""
import numpy as np
import pytest
from fingerprint_service.chromaprint_engine import (
    SECONDS_PER_VALUE,
    FingerprintError,
    RawFingerprint,
    fingerprint_pcm,
)
from fingerprint_service.reference_index import (
    CHUNK_BITS,
    KEY_CHUNKS,
    MIN_OVERLAP_VALUES,
    ReferenceIndex,
    TrackRef,
    _keys_of,
    index_keys,
)


def fp_of(tone_pcm, seconds=40.0, seed=1.0, noise=0.0):
    return fingerprint_pcm(tone_pcm(seconds, seed=seed, noise=noise), 22050)


class TestIndexKeys:
    def test_produces_one_key_per_chunk(self):
        assert len(index_keys(0xDEADBEEF)) == KEY_CHUNKS

    def test_chunks_cannot_collide_with_each_other(self):
        # Identical bits in two halves must still be two distinct keys, or a
        # value votes for itself twice and the counts lie.
        value = (0x1234 << (CHUNK_BITS + 4)) | (0x1234 << 4)
        assert len(set(index_keys(value))) == KEY_CHUNKS

    def test_ignores_the_noisy_low_bits(self):
        # The whole point of dropping them: a value differing only down there is
        # the same key, so surface noise does not hide a match.
        assert index_keys(0xABCDEF00) == index_keys(0xABCDEF00 | 0xF)

    def test_a_changed_high_bit_changes_a_key(self):
        assert index_keys(0x00000010) != index_keys(0x80000010)

    def test_the_array_form_agrees_with_the_scalar_rule(self):
        # The index is built with `_keys_of`; `index_keys` documents the rule.
        values = [0, 1, 0xF, 0x10, 0xABCDEF00, 0x7FFFFFFF, 0x80000000, 0xFFFFFFFF]
        rng = np.random.default_rng(315)
        values += [int(v) for v in rng.integers(0, 2**32, 500, dtype=np.uint64)]

        keys = _keys_of(np.asarray(values, dtype=np.uint32))

        assert [tuple(int(k) for k in column) for column in keys.T] == [
            index_keys(v) for v in values
        ]


class TestAdd:
    def test_counts_tracks_and_postings(self, tone_pcm):
        index = ReferenceIndex()
        index.add(TrackRef("t1", 1), fp_of(tone_pcm))

        assert len(index) == 1
        # Every value is indexed under each chunk.
        assert index.posting_count > 0

    def test_ignores_a_track_with_no_values(self):
        # Too short to fingerprint is unmatchable, not invalid.
        index = ReferenceIndex()
        index.add(TrackRef("t1", 1), RawFingerprint(()))
        assert len(index) == 0

    def test_a_track_added_after_a_search_is_found(self, tone_pcm):
        # Adds queue until the next search; the arrays must be rebuilt then.
        index = ReferenceIndex()
        index.add(TrackRef("t1", 1), fp_of(tone_pcm, seconds=60.0, seed=1.0))
        index.search(fp_of(tone_pcm, seconds=15.0, seed=1.0), max_bit_error_rate=0.25)

        later = fp_of(tone_pcm, seconds=60.0, seed=3.7)
        index.add(TrackRef("t2", 1), later)
        hits = index.search(RawFingerprint(later.values[150:280]), max_bit_error_rate=0.25)

        assert hits[0].track.track_id == "t2"
        assert index.posting_count == KEY_CHUNKS * (
            len(fp_of(tone_pcm, seconds=60.0, seed=1.0).values) + len(later.values)
        )


class TestAddBlob:
    """The loader's path: stored little-endian bytes, no Python ints (#315)."""

    def test_indexes_exactly_what_add_does(self, tone_pcm):
        reference = fp_of(tone_pcm, seconds=60.0)
        query = RawFingerprint(reference.values[200:330])
        via_add, via_blob = ReferenceIndex(), ReferenceIndex()
        via_add.add(TrackRef("t1", 1), reference)
        via_blob.add_blob(TrackRef("t1", 1), reference.to_bytes())

        assert via_blob.posting_count == via_add.posting_count
        assert via_blob.search(query, max_bit_error_rate=0.25) == via_add.search(
            query, max_bit_error_rate=0.25
        )

    def test_rejects_a_blob_that_is_not_whole_uint32s(self):
        with pytest.raises(FingerprintError, match="whole number"):
            ReferenceIndex().add_blob(TrackRef("t1", 1), b"\x01\x02\x03")

    def test_ignores_an_empty_blob(self):
        index = ReferenceIndex()
        index.add_blob(TrackRef("t1", 1), b"")
        assert len(index) == 0


class TestSearch:
    def test_finds_a_track_by_an_excerpt_of_itself(self, tone_pcm):
        index = ReferenceIndex()
        reference = fp_of(tone_pcm, seconds=60.0)
        index.add(TrackRef("t1", 1), reference)

        excerpt = RawFingerprint(reference.values[200:320])
        hits = index.search(excerpt, max_bit_error_rate=0.25)

        assert len(hits) == 1
        assert hits[0].track == TrackRef("t1", 1)
        assert hits[0].bit_error_rate == 0.0

    def test_reports_where_in_the_track_the_window_starts(self, tone_pcm):
        index = ReferenceIndex()
        reference = fp_of(tone_pcm, seconds=90.0)
        index.add(TrackRef("t1", 1), reference)

        start = 300
        hits = index.search(
            RawFingerprint(reference.values[start : start + 120]),
            max_bit_error_rate=0.25,
        )

        assert hits[0].offset_seconds == pytest.approx(start * SECONDS_PER_VALUE, abs=0.2)

    def test_picks_the_right_track_out_of_several(self, tone_pcm):
        index = ReferenceIndex()
        wanted = None
        for i, seed in enumerate((1.0, 2.3, 3.7, 4.9), start=1):
            fp = fp_of(tone_pcm, seconds=60.0, seed=seed)
            index.add(TrackRef(f"t{i}", 1), fp)
            if i == 3:
                wanted = fp

        hits = index.search(
            RawFingerprint(wanted.values[150:280]), max_bit_error_rate=0.25
        )

        assert hits[0].track.track_id == "t3"

    def test_returns_nothing_for_audio_that_is_not_indexed(self, tone_pcm):
        index = ReferenceIndex()
        index.add(TrackRef("t1", 1), fp_of(tone_pcm, seed=1.0))

        hits = index.search(fp_of(tone_pcm, seed=9.1), max_bit_error_rate=0.25)

        assert hits == []

    def test_returns_nothing_from_an_empty_index(self, tone_pcm):
        assert ReferenceIndex().search(fp_of(tone_pcm), max_bit_error_rate=0.25) == []

    def test_returns_nothing_when_no_key_is_indexed(self):
        # Every query key sorts past the last indexed one: no postings at all.
        index = ReferenceIndex()
        index.add(TrackRef("t1", 1), RawFingerprint(tuple(i << 4 for i in range(100))))

        query = RawFingerprint((0xFFFFFFF0,) * 60)

        assert index.search(query, max_bit_error_rate=0.25) == []

    def test_an_empty_index_tallies_nothing(self):
        _, counts, _ = ReferenceIndex()._tally(np.asarray([1, 2, 3], dtype=np.uint32))
        assert len(counts) == 0

    def test_a_tie_goes_to_the_track_indexed_first(self, tone_pcm):
        # The tuple-based index broke ties this way; the numpy one must too,
        # or the same window could name a different track after a rebuild.
        index = ReferenceIndex()
        reference = fp_of(tone_pcm, seconds=60.0)
        index.add(TrackRef("first", 1), reference)
        index.add(TrackRef("second", 1), reference)

        hits = index.search(
            RawFingerprint(reference.values[200:330]), max_bit_error_rate=0.25
        )

        assert hits[0].track.track_id == "first"

    def test_returns_nothing_for_an_empty_query(self, tone_pcm):
        index = ReferenceIndex()
        index.add(TrackRef("t1", 1), fp_of(tone_pcm))
        assert index.search(RawFingerprint(()), max_bit_error_rate=0.25) == []

    def test_survives_a_degraded_query(self, tone_pcm):
        """The case that drove the split key.

        Noise at 2.8 puts the bit error rate around 0.23 — the same band as the
        real confirmed-but-missed match on the #271 corpus, a track buried under
        a crossfade. It must still be found.
        """
        index = ReferenceIndex()
        index.add(TrackRef("t1", 1), fingerprint_pcm(tone_pcm(60.0, seed=1.0), 22050))

        noisy = fingerprint_pcm(tone_pcm(60.0, seed=1.0, noise=2.8), 22050)
        hits = index.search(RawFingerprint(noisy.values[200:330]), max_bit_error_rate=0.25)

        assert hits, "a degraded excerpt of an indexed track should still match"
        assert hits[0].track.track_id == "t1"
        assert 0.1 < hits[0].bit_error_rate < 0.25

    def test_splitting_the_key_multiplies_the_evidence(self, tone_pcm, monkeypatch):
        """Why the key is split, demonstrated rather than asserted in a comment.

        With one 28-bit key a degraded value has to survive completely intact to
        generate any posting, so the correct alignment collects a vote or two
        and ranks by luck. On the real corpus that luck ran out and a track
        playing for three minutes was never even a candidate. Splitting the key
        lets a value with one damaged half still match on the other, and the
        correct alignment wins on corroboration instead.

        This is the regression guard for anyone tempted to simplify it back.
        """
        import fingerprint_service.reference_index as module

        clean = fingerprint_pcm(tone_pcm(60.0, seed=1.0), 22050)
        noisy = fingerprint_pcm(tone_pcm(60.0, seed=1.0, noise=3.6), 22050)
        query = RawFingerprint(noisy.values[200:330])

        def best_vote_count() -> int:
            index = ReferenceIndex()
            index.add(TrackRef("t1", 1), clean)
            _, counts, _ = index._tally(np.asarray(query.values, dtype=np.uint32))
            return int(counts.max(initial=0))

        monkeypatch.setattr(module, "KEY_CHUNKS", 1)
        monkeypatch.setattr(module, "CHUNK_BITS", 28)
        single = best_vote_count()

        monkeypatch.setattr(module, "KEY_CHUNKS", 2)
        monkeypatch.setattr(module, "CHUNK_BITS", 14)
        split = best_vote_count()

        assert split > single, f"split key gave {split} votes vs {single}"
        assert split >= 2 * single, (
            f"splitting the key should multiply the corroboration, got "
            f"{split} vs {single}"
        )

    def test_the_threshold_is_enforced(self, tone_pcm):
        index = ReferenceIndex()
        reference = fp_of(tone_pcm, seconds=60.0)
        index.add(TrackRef("t1", 1), reference)
        excerpt = RawFingerprint(reference.values[200:320])

        # An exact excerpt has BER 0.0, so no threshold can reject it...
        assert index.search(excerpt, max_bit_error_rate=0.001)
        # ...but a threshold of zero excludes everything, being exclusive.
        assert index.search(excerpt, max_bit_error_rate=0.0) == []

    def test_refuses_a_match_on_too_little_overlap(self, tone_pcm):
        """The guard that keeps the split key from inventing matches.

        Short alignments are where a handful of values agree by luck; without
        this floor they cost four false positives per 788 queries on the real
        corpus.
        """
        index = ReferenceIndex()
        reference = fp_of(tone_pcm, seconds=60.0)
        index.add(TrackRef("t1", 1), reference)

        tiny = RawFingerprint(reference.values[100 : 100 + MIN_OVERLAP_VALUES - 1])
        assert index.search(tiny, max_bit_error_rate=0.25) == []

        enough = RawFingerprint(reference.values[100 : 100 + MIN_OVERLAP_VALUES])
        assert index.search(enough, max_bit_error_rate=0.25)

    def test_returns_at_most_one_candidate(self, tone_pcm):
        # List-shaped for #279's sake, but single best match is the behaviour.
        index = ReferenceIndex()
        for i, seed in enumerate((1.0, 2.3, 3.7), start=1):
            index.add(TrackRef(f"t{i}", 1), fp_of(tone_pcm, seconds=60.0, seed=seed))
        reference = fp_of(tone_pcm, seconds=60.0, seed=2.3)

        hits = index.search(
            RawFingerprint(reference.values[150:300]), max_bit_error_rate=0.25
        )

        assert len(hits) <= 1

    def test_confidence_is_the_complement_of_the_error_rate(self, tone_pcm):
        index = ReferenceIndex()
        reference = fp_of(tone_pcm, seconds=60.0)
        index.add(TrackRef("t1", 1), reference)

        hit = index.search(
            RawFingerprint(reference.values[200:330]), max_bit_error_rate=0.25
        )[0]

        assert hit.confidence == pytest.approx(1.0 - hit.bit_error_rate)
