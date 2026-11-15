"""Ordering by a ranking profile (#1193): the payload, constraints as penalties, metrics."""

import asyncio
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.exceptions import RequestValidationError
from ga_service import OptimizeRequest, optimize, run_optimizer, validation_exception_handler
from keys import camelot_code, camelot_distance, wheel_distance
from metrics import bpm_jump_total, key_clash_count, ordering_metrics, vibe_distance_total
from optimizer import (
    _prepare_track_features,
    run_cohesive_blocks_optimizer,
    run_genetic_algorithm,
    run_greedy_algorithm,
    transition_score,
)
from pydantic import ValidationError
from ranking import LEGACY_WEIGHTS, MAX_TRACKS, OrderingRanking, failed_constraints

FIXTURES = Path(__file__).parent / "fixtures"
PLAYLIST = json.loads((FIXTURES / "playlist.json").read_text())["tracks"]
PRESETS = json.loads((FIXTURES / "preset_orderings.json").read_text())
MODES = {
    "genetic": lambda tracks, ranking: run_genetic_algorithm(tracks, seed=7, ranking=ranking),
    "greedy": lambda tracks, ranking: run_greedy_algorithm(tracks, ranking=ranking),
    "cohesive_blocks": lambda tracks, ranking: run_cohesive_blocks_optimizer(tracks, ranking=ranking),
}


def _tracks():
    return [dict(track) for track in PLAYLIST]


def _ranking(name):
    return OrderingRanking.model_validate(PRESETS["rankings"][name])


def _ids(tracks):
    return [track["track_id"] for track in tracks]


def _legacy_ranking(**constraints):
    return OrderingRanking(
        version=1,
        weights=LEGACY_WEIGHTS,
        constraints=constraints,
        constraint_penalty=1,
    )


# ─── Beatmatcher vs Selector ────────────────────────────────────────────────


@pytest.mark.parametrize("profile", ["beatmatcher", "selector"])
@pytest.mark.parametrize("mode", list(MODES))
def test_preset_orderings_and_their_metrics_are_pinned(profile, mode):
    ordered = MODES[mode](_tracks(), _ranking(profile))
    assert _ids(ordered) == PRESETS["orderings"][profile][mode]
    assert ordering_metrics(ordered) == PRESETS["metrics"][profile][mode]


@pytest.mark.parametrize("mode", ["genetic", "greedy"])
def test_beatmatcher_mixes_tempo_and_key_while_selector_keeps_the_vibe(mode):
    beat = PRESETS["metrics"]["beatmatcher"][mode]
    selector = PRESETS["metrics"]["selector"][mode]
    assert beat["bpm_jumps"] < selector["bpm_jumps"]
    assert beat["key_clashes"] < selector["key_clashes"]
    assert selector["vibe_distance"] < beat["vibe_distance"]
    assert PRESETS["orderings"]["beatmatcher"][mode] != PRESETS["orderings"]["selector"][mode]


def test_cohesive_blocks_keeps_its_genre_blocks_and_selector_tightens_the_vibe():
    beat = PRESETS["metrics"]["beatmatcher"]["cohesive_blocks"]
    selector = PRESETS["metrics"]["selector"]["cohesive_blocks"]
    assert selector["vibe_distance"] < beat["vibe_distance"]
    for profile in ("beatmatcher", "selector"):
        order = PRESETS["orderings"][profile]["cohesive_blocks"]
        assert {track[0] for track in order[:5]} == {"w"}


def test_the_endpoint_orders_by_the_ranking_it_is_sent():
    for mode in ("greedy", "cohesive_blocks"):
        request = OptimizeRequest(tracks=_tracks(), mode=mode, ranking=PRESETS["rankings"]["beatmatcher"])
        result = asyncio.run(optimize(request))
        assert _ids(result["result"]) == PRESETS["orderings"]["beatmatcher"][mode]
        assert result["mode"] == mode
    assert len(run_optimizer(_tracks(), "genetic", _ranking("selector"))) == len(PLAYLIST)


# ─── Scoring ────────────────────────────────────────────────────────────────


def test_legacy_weights_without_constraints_score_as_no_ranking():
    a, b = PLAYLIST[0], PLAYLIST[2]
    assert transition_score(a, b, _legacy_ranking()) == transition_score(a, b)
    assert _ids(run_greedy_algorithm(_tracks(), _legacy_ranking())) == _ids(run_greedy_algorithm(_tracks()))


def test_each_failed_constraint_costs_the_penalty():
    a, b = PLAYLIST[0], PLAYLIST[1]  # 100 BPM 8A → 124 BPM 2B
    plain = transition_score(a, b)
    both = _legacy_ranking(bpm_window={"unit": "ratio", "max": 0.06}, key_rule={"metric": "wheel", "max": 1})
    assert transition_score(a, b, both) == pytest.approx(plain - 2)
    tempo_only = _legacy_ranking(bpm_window={"unit": "bpm", "max": 30})
    assert transition_score(a, b, tempo_only.model_copy(update={"constraint_penalty": 0.5})) == plain


def test_genetic_with_a_ranking_starts_from_a_seed_index_and_returns_every_track():
    ordered = run_genetic_algorithm(_tracks(), seed=3, seed_idx=4, ranking=_ranking("beatmatcher"))
    assert sorted(_ids(ordered)) == sorted(_ids(PLAYLIST))
    assert run_genetic_algorithm(_tracks()[:1], ranking=_ranking("selector")) == _tracks()[:1]


def test_an_unknown_mode_is_refused():
    with pytest.raises(ValueError, match="Unsupported"):
        run_optimizer(_tracks(), "random")


# ─── Constraints ────────────────────────────────────────────────────────────


def _features(**track):
    return _prepare_track_features([track])[0]


def _fails(constraints, a, b):
    return failed_constraints(_legacy_ranking(**constraints).constraints, _features(**a), _features(**b))


def test_bpm_window_by_ratio_or_bpm_with_half_and_double_time():
    ratio = {"bpm_window": {"unit": "ratio", "max": 0.06}}
    assert _fails(ratio, {"bpm": 120}, {"bpm": 127}) == []
    assert _fails(ratio, {"bpm": 120}, {"bpm": 128}) == ["bpm_window"]
    assert _fails(ratio, {"bpm": 120}, {"bpm": 60}) == ["bpm_window"]
    half_double = {"bpm_window": {"unit": "ratio", "max": 0.06, "half_double": True}}
    assert _fails(half_double, {"bpm": 120}, {"bpm": 60}) == []
    assert _fails(half_double, {"bpm": 120}, {"bpm": 240}) == []
    absolute = {"bpm_window": {"unit": "bpm", "max": 4}}
    assert _fails(absolute, {"bpm": 120}, {"bpm": 124}) == []
    assert _fails(absolute, {"bpm": 120}, {"bpm": "125"}) == ["bpm_window"]
    assert _fails(absolute, {"bpm": 120}, {"bpm": None}) == []
    assert _fails(absolute, {"bpm": 0}, {"bpm": 200}) == []


def test_key_rule_on_the_wheel_or_by_camelot_distance():
    adjacent = {"key_rule": {"metric": "wheel", "max": 1}}
    assert _fails(adjacent, {"key": "8A"}, {"key": "9A"}) == []
    assert _fails(adjacent, {"key": "8A"}, {"key": "C major"}) == []
    assert _fails(adjacent, {"key": "8A"}, {"key": "10A"}) == ["key_rule"]
    assert _fails(adjacent, {"key": "8A"}, {"key": None}) == []
    assert _fails(adjacent, {"key": "8A"}, {"key": "H major"}) == []
    camelot = {"key_rule": {"metric": "camelot", "max": 1}}
    assert _fails(camelot, {"key": "8A"}, {"key": "9B"}) == ["key_rule"]
    assert _fails(camelot, {"key": "8A"}, {"key": "8B"}) == []


def test_energy_range_from_the_previous_track_and_unknown_passes():
    energy = {"energy_range": {"max_drop": 0.1, "max_rise": 0.2}}
    assert _fails(energy, {"danceability": 0.5}, {"danceability": 0.65}) == []
    assert _fails(energy, {"danceability": 0.5}, {"danceability": 0.8}) == ["energy_range"]
    assert _fails(energy, {"danceability": 0.5}, {"danceability": 0.3}) == ["energy_range"]
    assert _fails(energy, {"danceability": 0.5}, {"star_rating": 1}) == []


# ─── Validation ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "change",
    [
        {"version": 2},
        {"surprise": True},
        {"weights": {**LEGACY_WEIGHTS.model_dump(), "bpm": 11}},
        {"weights": {**LEGACY_WEIGHTS.model_dump(), "bpm": -0.1}},
        {"weights": {**LEGACY_WEIGHTS.model_dump(), "bpm": float("inf")}},
        {"weights": {**LEGACY_WEIGHTS.model_dump(), "era": 1}},
        {"weights": {"bpm": 1}},
        {"constraints": {"genre_floor": {"min": 0.1}}},
        {"constraints": {"bpm_window": {"unit": "percent", "max": 6}}},
        {"constraints": {"bpm_window": {"unit": "bpm", "max": 1001}}},
        {"constraints": {"key_rule": {"metric": "wheel", "max": 13}}},
        {"constraints": {"key_rule": {"metric": "wheel", "max": 1, "deep": {"x": 1}}}},
        {"constraints": {"energy_range": {"max_drop": 2, "max_rise": 0}}},
        {"constraint_penalty": 100},
        {"constraint_penalty": None},
    ],
)
def test_a_malformed_ranking_is_refused(change):
    payload = {**PRESETS["rankings"]["beatmatcher"], **change}
    with pytest.raises(ValidationError):
        OptimizeRequest(tracks=[], ranking=payload)


def test_constraints_default_to_none():
    ranking = OrderingRanking(version=1, weights=LEGACY_WEIGHTS, constraint_penalty=0)
    assert ranking.constraints.model_dump() == {"bpm_window": None, "key_rule": None, "energy_range": None}


def test_the_track_count_is_bounded():
    OptimizeRequest(tracks=[{}] * MAX_TRACKS)
    with pytest.raises(ValidationError):
        OptimizeRequest(tracks=[{}] * (MAX_TRACKS + 1))


def test_validation_errors_are_a_422_naming_the_field():
    try:
        OptimizeRequest(tracks=[], ranking={"version": 1})
    except ValidationError as error:
        exc = RequestValidationError(error.errors(), body={"ranking": {"version": 1}})
    request = type("Request", (), {"url": "http://ga-service/optimize"})()
    response = asyncio.run(validation_exception_handler(request, exc))
    assert response.status_code == 422
    body = json.loads(response.body)
    assert any(item["loc"][:2] == ("ranking", "weights") for item in exc.errors())
    assert body["detail"][0]["loc"][0] == "ranking"


# ─── Keys and metrics ───────────────────────────────────────────────────────


def test_camelot_codes_for_spelled_and_camelot_keys():
    assert camelot_code("A minor") == (8, "A")
    assert camelot_code("C major") == (8, "B")
    assert camelot_code("Db major") == (3, "B")
    assert camelot_code("F# minor") == (11, "A")
    assert camelot_code("Cb major") == (1, "B")
    assert camelot_code("12b") == (12, "B")
    assert camelot_code(None) is None
    assert camelot_code("Q minor") is None


def test_wheel_and_camelot_distances_match_the_apps():
    assert wheel_distance((8, "A"), (8, "A")) == 0
    assert wheel_distance((1, "A"), (12, "A")) == 1
    assert wheel_distance((8, "A"), (8, "B")) == 1
    assert wheel_distance((8, "A"), (2, "B")) == 2
    assert camelot_distance((8, "A"), (8, "A")) == 0
    assert camelot_distance((8, "A"), (8, "B")) == 0.5
    assert camelot_distance((8, "A"), (9, "B")) == 1.5
    assert camelot_distance((1, "A"), (11, "A")) == 2


def test_metrics_skip_transitions_missing_data():
    tracks = [
        {"bpm": 120, "key": "8A", "embedding": "[1, 0]"},
        {"bpm": "126", "key": "3B", "embedding": [0, 1]},
        {"bpm": None, "key": None, "embedding": [0, 0]},
        {"bpm": "fast", "key": "2B", "embedding": [0, 0]},
        {"bpm": 100, "key": "3B", "embedding": [1, 0, 0]},
        {"bpm": 98, "key": "4B", "embedding": []},
        {"embedding": None},
    ]
    assert bpm_jump_total(tracks) == 8
    assert key_clash_count(tracks) == 1
    assert vibe_distance_total(tracks) == pytest.approx(1)
    assert bpm_jump_total([{"bpm": 124}, {"bpm": 63}, {"bpm": 120}]) == 118
    assert bpm_jump_total([{"bpm": 124}, {"bpm": 63}, {"bpm": 120}], half_double=True) == 5
    assert ordering_metrics([{"bpm": 90}, {"bpm": 181}], half_double=True)["bpm_jumps"] == 0.5
    assert ordering_metrics([])["transitions"] == 0
    assert ordering_metrics(tracks)["transitions"] == 6
