from worker.essentia_bpm import extract_bpm_confidence


def test_margin_between_first_and_second_peak():
    rhythm = {
        "bpm_histogram_first_peak_weight": 0.282122910023,
        "bpm_histogram_second_peak_weight": 0.0241286866367,
    }
    assert extract_bpm_confidence(rhythm) == 0.258


def test_contested_pair_has_a_small_margin():
    rhythm = {
        "bpm_histogram_first_peak_weight": 0.3,
        "bpm_histogram_second_peak_weight": 0.28,
    }
    assert extract_bpm_confidence(rhythm) == 0.02


def test_missing_second_peak_counts_as_zero():
    assert extract_bpm_confidence({"bpm_histogram_first_peak_weight": 0.7}) == 0.7


def test_second_peak_heavier_than_first_clamps_to_zero():
    rhythm = {
        "bpm_histogram_first_peak_weight": 0.2,
        "bpm_histogram_second_peak_weight": 0.25,
    }
    assert extract_bpm_confidence(rhythm) == 0.0


def test_none_without_a_numeric_first_peak_weight():
    assert extract_bpm_confidence(None) is None
    assert extract_bpm_confidence({}) is None
    assert extract_bpm_confidence({"bpm_histogram_first_peak_weight": "high"}) is None
    assert extract_bpm_confidence({"bpm_histogram_first_peak_weight": True}) is None
