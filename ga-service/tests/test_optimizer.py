import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ga_service import OptimizeRequest, optimize
from optimizer import (
    bpm_compatibility,
    metadata_similarity,
    run_cohesive_blocks_optimizer,
    transition_score,
)


def test_metadata_similarity_uses_genres_styles_and_local_tags():
    a = {
        "genres": ["Electronic"],
        "styles": ["Deep House", "Garage House"],
        "local_tags": "warm, late night",
    }
    b = {
        "genres": ["Electronic"],
        "styles": ["Deep House"],
        "local_tags": "warm vinyl",
    }
    c = {
        "genres": ["Jazz"],
        "styles": ["Hard Bop"],
        "local_tags": "brassy",
    }

    assert metadata_similarity(a, b) > 0.45
    assert metadata_similarity(a, b) > metadata_similarity(a, c)


def test_bpm_compatibility_handles_half_and_double_time():
    assert bpm_compatibility(90, 180) > 0.95
    assert bpm_compatibility(180, 90) > 0.95
    assert bpm_compatibility(90, 128) < 0.4


def test_same_artist_transition_penalty():
    base = {
        "genres": ["Electronic"],
        "styles": ["House"],
        "local_tags": "warm",
        "bpm": 120,
        "key": "8A",
        "danceability": 0.7,
        "embedding": json.dumps([1.0, 0.0]),
    }
    same_artist = {**base, "artist": "A", "album": "One"}
    other_same_artist = {**base, "artist": "A", "album": "Two"}
    different_artist = {**base, "artist": "B", "album": "Two"}

    assert transition_score(same_artist, other_same_artist) < transition_score(
        same_artist,
        different_artist,
    )


def test_optimize_endpoint_selects_supported_modes():
    tracks = [
        {
            "title": "A",
            "artist": "One",
            "crate_id": "kept-extra-field",
            "genres": ["Electronic"],
            "styles": ["House"],
            "bpm": 120,
            "embedding": json.dumps([1.0, 0.0]),
        },
        {
            "title": "B",
            "artist": "Two",
            "genres": ["Electronic"],
            "styles": ["House"],
            "bpm": 122,
            "embedding": json.dumps([0.9, 0.1]),
        },
    ]

    for mode in ("genetic", "greedy", "cohesive_blocks"):
        result = asyncio.run(optimize(OptimizeRequest(tracks=tracks, mode=mode)))
        assert result["mode"] == mode
        assert len(result["result"]) == 2
        assert any(track.get("crate_id") == "kept-extra-field" for track in result["result"])


def test_cohesive_blocks_keep_related_styles_near_each_other():
    tracks = [
        {
            "title": "house 1",
            "artist": "A",
            "genres": ["Electronic"],
            "styles": ["Deep House"],
            "local_tags": "warm groove",
            "danceability": 0.5,
        },
        {
            "title": "jazz 1",
            "artist": "B",
            "genres": ["Jazz"],
            "styles": ["Soul Jazz"],
            "local_tags": "laid back",
            "danceability": 0.4,
        },
        {
            "title": "house 2",
            "artist": "C",
            "genres": ["Electronic"],
            "styles": ["Garage House"],
            "local_tags": "warm groove",
            "danceability": 0.6,
        },
        {
            "title": "jazz 2",
            "artist": "D",
            "genres": ["Jazz"],
            "styles": ["Modal Jazz"],
            "local_tags": "laid back",
            "danceability": 0.45,
        },
        {
            "title": "techno",
            "artist": "E",
            "genres": ["Electronic"],
            "styles": ["Techno"],
            "local_tags": "peak driving",
            "danceability": 0.9,
        },
    ]

    ordered = run_cohesive_blocks_optimizer(tracks)
    positions = {track["title"]: index for index, track in enumerate(ordered)}

    assert abs(positions["house 1"] - positions["house 2"]) == 1
    assert abs(positions["jazz 1"] - positions["jazz 2"]) == 1
