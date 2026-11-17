"""The `ranking` an /optimize request may carry (#1193): transition weights and constraints.

ga-service knows nothing about profiles or storage. The app resolves the
active ranking profile and translates it into this object; without one, the
optimiser scores exactly as it always has (`LEGACY_WEIGHTS`, no constraints).

Constraints can't drop a track from a playlist, so in ordering they are
penalties: every constraint a transition fails subtracts `constraint_penalty`
from that transition's score.

`version` 2 (#1218) ranks the embedding term within the request
(`pool_rank` over every pair of tracks), as the app's ranker ranks its
similarity signals within a candidate pool: the raw `(cos + 1) / 2` of a
playlist's tracks spans only a few hundredths, so any other weight swamped
it. Version 1 keeps the raw term, so an older app orders as it did.
"""

from typing import Annotated, Literal

from keys import camelot_code, camelot_distance, wheel_distance
from pydantic import BaseModel, ConfigDict, Field

MAX_TRACKS = 1000
"""The most tracks one /optimize request may order."""

_Weight = Annotated[float, Field(ge=0, le=10, allow_inf_nan=False)]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TransitionWeights(_Strict):
    """One weight per term of a transition's score; the artist and album terms are subtracted."""

    metadata: _Weight
    embedding: _Weight
    energy: _Weight
    bpm: _Weight
    key: _Weight
    same_artist: _Weight
    same_album: _Weight


LEGACY_WEIGHTS = TransitionWeights(
    metadata=0.36,
    embedding=0.24,
    energy=0.20,
    bpm=0.08,
    key=0.05,
    same_artist=0.20,
    same_album=0.12,
)
"""The constants every request without `ranking` scores with."""


class BpmWindow(_Strict):
    unit: Literal["ratio", "bpm"]
    max: float = Field(ge=0, le=1000, allow_inf_nan=False)
    half_double: bool = False


class KeyRule(_Strict):
    metric: Literal["wheel", "camelot"]
    max: float = Field(ge=0, le=12, allow_inf_nan=False)


class EnergyRange(_Strict):
    max_drop: float = Field(ge=0, le=1, allow_inf_nan=False)
    max_rise: float = Field(ge=0, le=1, allow_inf_nan=False)


class TransitionConstraints(_Strict):
    bpm_window: BpmWindow | None = None
    key_rule: KeyRule | None = None
    energy_range: EnergyRange | None = None


class OrderingRanking(_Strict):
    version: Literal[1, 2]
    weights: TransitionWeights
    constraints: TransitionConstraints = Field(default_factory=TransitionConstraints)
    constraint_penalty: float = Field(ge=0, le=10, allow_inf_nan=False)


def failed_constraints(constraints, prev, nxt):
    """
    The constraint ids the transition `prev` → `nxt` fails, with the previous
    track as the seed, as the app's ranker reads them. `prev`/`nxt` are
    optimiser features: `bpm_value` (a positive float or None), `key` and
    `energy_raw` (None when unknown). Unknown data on either side passes.
    """
    failed = []
    window = constraints.bpm_window
    if window and prev["bpm_value"] is not None and nxt["bpm_value"] is not None:
        base = prev["bpm_value"]
        tempo = nxt["bpm_value"]
        tempos = (tempo, tempo * 2, tempo / 2) if window.half_double else (tempo,)
        distance = min(abs(t - base) / base if window.unit == "ratio" else abs(t - base) for t in tempos)
        if distance > window.max:
            failed.append("bpm_window")

    rule = constraints.key_rule
    if rule:
        a = camelot_code(prev["key"])
        b = camelot_code(nxt["key"])
        if a and b:
            distance = wheel_distance(a, b) if rule.metric == "wheel" else camelot_distance(a, b)
            if distance > rule.max:
                failed.append("key_rule")

    energy = constraints.energy_range
    if energy and prev["energy_raw"] is not None and nxt["energy_raw"] is not None:
        change = nxt["energy_raw"] - prev["energy_raw"]
        if change > energy.max_rise or -change > energy.max_drop:
            failed.append("energy_range")
    return failed


def pool_rank(values):
    """
    Rank-normalise raw values within their pool, as the app's `poolRank`
    (`src/lib/ranking/signals.ts`): each value becomes the share of the
    pool's other values it is at least as high as, so the best is 1 and the
    worst 0. Tied values share the higher rank; one value (or all equal) is
    1; None stays None and isn't counted.
    """
    present = sorted((v, i) for i, v in enumerate(values) if v is not None)
    out = [None] * len(values)
    others = len(present) - 1
    end = others
    for k in range(len(present) - 1, -1, -1):
        if k < others and present[k][0] != present[k + 1][0]:
            end = k
        out[present[k][1]] = 1.0 if others == 0 else end / others
    return out
