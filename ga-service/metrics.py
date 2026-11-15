"""How an ordering mixes, transition by transition (#1193; reused by profile evaluation, #1196).

Pure. The app has the same functions in `src/lib/ranking/orderingMetrics.ts`;
both are pinned on `tests/fixtures/preset_orderings.json`.
"""

import json
import math

from keys import camelot_code, wheel_distance


def _bpm(value):
    try:
        bpm = float(value)
    except (TypeError, ValueError):
        return None
    return bpm if math.isfinite(bpm) and bpm > 0 else None


def _vector(value):
    if isinstance(value, str):
        value = json.loads(value)
    if not isinstance(value, (list, tuple)) or not value:
        return None
    return [float(x) for x in value]


def _pairs(tracks):
    return zip(tracks, tracks[1:])


def bpm_jump_total(tracks, half_double=False):
    """
    Σ |ΔBPM| over transitions where both tempos are known. Lower mixes more
    smoothly. `half_double` measures each jump to the nearest of the next
    track's tempo, double it or half it, as a profile with half/double time
    mixes it (124 → 63 is a jump of 2).
    """
    total = 0.0
    for a, b in _pairs(tracks):
        x, y = _bpm(a.get("bpm")), _bpm(b.get("bpm"))
        if x is not None and y is not None:
            tempos = (y, y * 2, y / 2) if half_double else (y,)
            total += min(abs(t - x) for t in tempos)
    return total


def key_clash_count(tracks):
    """Transitions whose keys are both known and more than one step apart on the wheel."""
    clashes = 0
    for a, b in _pairs(tracks):
        x, y = camelot_code(a.get("key")), camelot_code(b.get("key"))
        if x and y and wheel_distance(x, y) > 1:
            clashes += 1
    return clashes


def vibe_distance_total(tracks):
    """Σ (1 − cosine similarity) of the audio_vibe embeddings over transitions where both are known."""
    total = 0.0
    for a, b in _pairs(tracks):
        x, y = _vector(a.get("embedding")), _vector(b.get("embedding"))
        if not x or not y or len(x) != len(y):
            continue
        norm = math.sqrt(sum(v * v for v in x)) * math.sqrt(sum(v * v for v in y))
        if norm == 0:
            continue
        total += 1.0 - sum(p * q for p, q in zip(x, y)) / norm
    return total


def ordering_metrics(tracks, half_double=False):
    return {
        "transitions": max(len(tracks) - 1, 0),
        "bpm_jumps": bpm_jump_total(tracks, half_double),
        "key_clashes": key_clash_count(tracks),
        "vibe_distance": vibe_distance_total(tracks),
    }
