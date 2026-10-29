"""BPM confidence from Essentia's `rhythm` output (#531).

The Python twin of `my-collection-search/src/lib/essentiaBpm.ts`. `rhythm.bpm`
arrives with a beat histogram; the margin between its first and second peak
weights is stored as `bpm_confidence` so a contested tempo can be flagged
(see the TypeScript module for why margin rather than the raw weight).
"""

from typing import Any


def _weight(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def extract_bpm_confidence(rhythm: dict[str, Any] | None) -> float | None:
    """First-peak weight minus second-peak weight, rounded to 3 decimals.

    A missing second peak counts as 0. None when there is no first-peak weight.
    """
    rhythm = rhythm or {}
    first = _weight(rhythm.get("bpm_histogram_first_peak_weight"))
    if first is None:
        return None
    second = _weight(rhythm.get("bpm_histogram_second_peak_weight")) or 0.0
    return round(max(0.0, first - second), 3)
