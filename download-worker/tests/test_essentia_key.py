from worker.essentia_key import extract_key_analysis, log_key_profile_disagreement


class TestExtractKeyAnalysis:
    def test_passes_a_single_candidate_straight_through(self):
        key, confidence = extract_key_analysis(
            {"key_edma": {"key": "C", "scale": "major", "strength": 0.6177087426190001}}
        )
        assert key == "C major"
        assert confidence == 0.618

    def test_returns_nones_when_tonal_is_missing(self):
        assert extract_key_analysis(None) == (None, None)

    def test_returns_nones_when_nothing_has_both_a_key_and_a_scale(self):
        assert extract_key_analysis({"key_edma": {"strength": 0.5}}) == (None, None)

    def test_returns_a_none_confidence_when_the_single_candidate_has_no_strength(self):
        key, confidence = extract_key_analysis({"key_edma": {"key": "D", "scale": "minor"}})
        assert key == "D minor"
        assert confidence is None

    def test_picks_the_unanimous_key_when_all_three_profiles_agree(self):
        key, confidence = extract_key_analysis(
            {
                "key_edma": {"key": "D", "scale": "minor", "strength": 0.7},
                "key_krumhansl": {"key": "D", "scale": "minor", "strength": 0.75},
                "key_temperley": {"key": "D", "scale": "minor", "strength": 0.8},
            }
        )
        assert key == "D minor"
        assert confidence == 0.75

    def test_lets_a_majority_override_a_minority_edma(self):
        """#524: edma is EDM-tuned and often the outlier. This is the exact
        fixture from the original disagreement-log test -- edma alone said F
        major; krumhansl and temperley agreed on C major. The pipeline used
        to blindly trust edma's minority answer; this is the actual bug the
        consensus logic fixes (distinct from the issue's own track, where
        all three profiles agreed -- see the chords_key tests below)."""
        key, confidence = extract_key_analysis(
            {
                "key_edma": {"key": "F", "scale": "major", "strength": 0.62},
                "key_krumhansl": {"key": "C", "scale": "major", "strength": 0.58},
                "key_temperley": {"key": "C", "scale": "major", "strength": 0.55},
            }
        )
        assert key == "C major"
        assert confidence == 0.565

    def test_averages_only_the_agreeing_pairs_strengths(self):
        _, confidence = extract_key_analysis(
            {
                "key_edma": {"key": "F", "scale": "major", "strength": 0.99},
                "key_krumhansl": {"key": "C", "scale": "major", "strength": 0.5},
                "key_temperley": {"key": "C", "scale": "major", "strength": 0.5},
            }
        )
        assert confidence == 0.5

    def test_ignores_a_missing_strength_within_the_majority_when_averaging(self):
        key, confidence = extract_key_analysis(
            {
                "key_edma": {"key": "F", "scale": "major"},
                "key_krumhansl": {"key": "F", "scale": "major", "strength": 0.6},
            }
        )
        assert key == "F major"
        assert confidence == 0.6

    def test_falls_back_to_the_highest_strength_estimate_when_all_three_disagree(self):
        key, confidence = extract_key_analysis(
            {
                "key_edma": {"key": "F", "scale": "major", "strength": 0.5},
                "key_krumhansl": {"key": "C", "scale": "major", "strength": 0.6},
                "key_temperley": {"key": "G", "scale": "major", "strength": 0.4},
            }
        )
        assert key == "C major"
        assert confidence == 0.6

    def test_falls_back_to_edma_when_strengths_are_missing_or_tied(self):
        key, confidence = extract_key_analysis(
            {
                "key_edma": {"key": "F", "scale": "major"},
                "key_krumhansl": {"key": "C", "scale": "major"},
                "key_temperley": {"key": "G", "scale": "major"},
            }
        )
        assert key == "F major"
        assert confidence is None

    def test_treats_two_agreeing_candidates_as_a_majority_with_the_third_missing(self):
        key, confidence = extract_key_analysis(
            {
                "key_edma": {"key": "F", "scale": "major", "strength": 0.5},
                "key_krumhansl": {"key": "F", "scale": "major", "strength": 0.7},
            }
        )
        assert key == "F major"
        assert confidence == 0.6

    def test_falls_back_between_two_disagreeing_candidates_with_the_third_missing(self):
        key, confidence = extract_key_analysis(
            {
                "key_edma": {"key": "F", "scale": "major", "strength": 0.5},
                "key_krumhansl": {"key": "C", "scale": "major", "strength": 0.7},
            }
        )
        assert key == "C major"
        assert confidence == 0.7

    def test_never_lets_chords_key_participate_in_the_vote(self):
        key, confidence = extract_key_analysis(
            {
                "key_edma": {"key": "F", "scale": "major", "strength": 0.5},
                "key_krumhansl": {"key": "C", "scale": "major", "strength": 0.4},
                "chords_key": "F",
                "chords_scale": "major",
            }
        )
        assert key == "F major"
        assert confidence == 0.5


class TestLogKeyProfileDisagreement:
    def test_logs_nothing_when_every_estimate_agrees(self, caplog):
        log_key_profile_disagreement(
            {
                "key_edma": {"key": "D", "scale": "minor"},
                "key_krumhansl": {"key": "D", "scale": "minor"},
                "key_temperley": {"key": "D", "scale": "minor"},
                "chords_key": "D",
                "chords_scale": "minor",
            },
            "trk_001",
            1,
        )
        assert "disagreement" not in caplog.text

    def test_logs_edma_as_disagreeing_when_outvoted_by_krumhansl_and_temperley(self, caplog):
        log_key_profile_disagreement(
            {
                "key_edma": {"key": "F", "scale": "major"},
                "key_krumhansl": {"key": "C", "scale": "major"},
                "key_temperley": {"key": "C", "scale": "major"},
            },
            "trk_001",
            1,
        )
        assert "trk_001" in caplog.text
        assert "stored key=C major" in caplog.text
        assert "edma=F major" in caplog.text
        assert "krumhansl=" not in caplog.text
        assert "temperley=" not in caplog.text

    def test_logs_a_chords_key_disagreement_even_when_all_three_profiles_agree(self, caplog):
        """The real track behind #524: key_edma/krumhansl/temperley all said F
        major (strengths ~0.68-0.70); only chords_key said C major, matching
        tunebat/songbpm. The three-profile consensus alone misses this --
        chosen key stays F major, chords is the only dissenter."""
        log_key_profile_disagreement(
            {
                "key_edma": {"key": "F", "scale": "major", "strength": 0.704965293407},
                "key_krumhansl": {"key": "F", "scale": "major", "strength": 0.695810675621},
                "key_temperley": {"key": "F", "scale": "major", "strength": 0.680185735226},
                "chords_key": "C",
                "chords_scale": "major",
            },
            "trk_001",
            1,
        )
        assert "stored key=F major" in caplog.text
        assert "edma=" not in caplog.text
        assert "krumhansl=" not in caplog.text
        assert "temperley=" not in caplog.text
        assert "chords=C major" in caplog.text

    def test_ignores_a_partial_chords_estimate_missing_scale(self, caplog):
        log_key_profile_disagreement(
            {"key_edma": {"key": "F", "scale": "major"}, "chords_key": "C"},
            "trk_001",
            1,
        )
        assert caplog.text == ""

    def test_logs_krumhansl_as_disagreeing_when_edma_wins_a_fallback_tiebreak(self, caplog):
        log_key_profile_disagreement(
            {
                "key_edma": {"key": "F", "scale": "major"},
                "key_krumhansl": {"key": "C", "scale": "major"},
            },
            "trk_001",
            1,
        )
        assert "stored key=F major" in caplog.text
        assert "krumhansl=C major" in caplog.text

    def test_logs_only_the_profile_that_actually_disagrees_with_a_majority(self, caplog):
        log_key_profile_disagreement(
            {
                "key_edma": {"key": "F", "scale": "major"},
                "key_krumhansl": {"key": "F", "scale": "major"},
                "key_temperley": {"key": "C", "scale": "major"},
            },
            "trk_001",
            1,
        )
        assert "krumhansl=" not in caplog.text
        assert "temperley=C major" in caplog.text

    def test_does_nothing_when_only_one_estimate_exists_and_nothing_disagrees(self, caplog):
        log_key_profile_disagreement({"key_krumhansl": {"key": "C", "scale": "major"}}, "trk_001", 1)
        assert caplog.text == ""

    def test_does_nothing_when_tonal_is_missing(self, caplog):
        log_key_profile_disagreement(None, "trk_001", 1)
        assert caplog.text == ""
