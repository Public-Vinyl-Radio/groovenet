"""Today's orderings, pinned before ranking profiles reached ga-service (#1193).

A request without `ranking` must order exactly as before, byte for byte. These
tests were written against the unchanged optimiser and must not be edited to
follow a change: if one fails, the default behaviour moved.
"""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ga_service import OptimizeRequest, optimize
from optimizer import (
    run_cohesive_blocks_optimizer,
    run_genetic_algorithm,
    run_greedy_algorithm,
    transition_score,
)

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "playlist.json").read_text())


def _tracks():
    return [dict(track) for track in FIXTURE["tracks"]]


# Sparse data: no key, no BPM, a string BPM, no embedding, no moods, a rating only.
SPARSE = [
    {"track_id": "s1", "artist": "A", "album": "X", "genres": ["Jazz"], "bpm": 90, "key": "A minor"},
    {"track_id": "s2", "artist": "A", "album": "X", "genres": ["Jazz"], "styles": ["Bop"]},
    {"track_id": "s3", "artist": "B", "bpm": "120", "key": "C major", "star_rating": 4},
    {"track_id": "s4", "artist": "C", "styles": ["Bop"], "bpm": 180, "key": "E minor", "mood_aggressive": 0.9},
    {"track_id": "s5", "artist": "D", "genres": ["Electronic"], "bpm": 122, "key": "5A", "embedding": "[0.3, 0.4]"},
    {"track_id": "s6", "artist": "E", "genres": ["Electronic"], "bpm": 124, "key": "6A", "embedding": "[0.4, 0.3]"},
]


def _ids(tracks):
    return [track["track_id"] for track in tracks]


def test_genetic_ordering_is_pinned_for_seeded_runs():
    assert _ids(run_genetic_algorithm(_tracks(), seed=7)) == [
        "b4", "b2", "w3", "w1", "w5", "w2", "w4", "b1", "b3", "b5",
    ]  # fmt: skip
    assert _ids(run_genetic_algorithm(_tracks(), seed=1193)) == [
        "b1", "b5", "b3", "w2", "w4", "w5", "w1", "w3", "b4", "b2",
    ]  # fmt: skip


def test_greedy_ordering_is_pinned():
    assert _ids(run_greedy_algorithm(_tracks())) == [
        "w1", "w3", "w5", "w2", "w4", "b1", "b3", "b5", "b2", "b4",
    ]  # fmt: skip
    assert _ids(run_greedy_algorithm(SPARSE)) == ["s1", "s4", "s2", "s5", "s6", "s3"]


def test_cohesive_blocks_ordering_is_pinned():
    assert _ids(run_cohesive_blocks_optimizer(_tracks())) == [
        "w1", "w3", "w2", "w4", "w5", "b4", "b2", "b5", "b3", "b1",
    ]  # fmt: skip
    assert _ids(run_cohesive_blocks_optimizer(SPARSE)) == ["s1", "s6", "s5", "s3", "s4", "s2"]


def test_transition_scores_are_pinned_to_the_bit():
    tracks = _tracks()
    assert transition_score(tracks[0], tracks[2]) == 0.604440040247071
    assert transition_score(tracks[1], tracks[5]) == 0.9065654168426507
    assert transition_score(SPARSE[0], SPARSE[1]) == 0.13884615384615384


def test_endpoint_without_ranking_orders_as_the_algorithms_do():
    for mode, expected in (
        ("greedy", run_greedy_algorithm(_tracks())),
        ("cohesive_blocks", run_cohesive_blocks_optimizer(_tracks())),
    ):
        result = asyncio.run(optimize(OptimizeRequest(tracks=_tracks(), mode=mode)))
        assert _ids(result["result"]) == _ids(expected)
        assert set(result) == {"result", "mode"}
