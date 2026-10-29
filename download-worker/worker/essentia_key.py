"""Key extraction from Essentia's `tonal` output (#524).

MusicExtractor computes key three independent ways -- key_krumhansl,
key_temperley and key_edma -- each `{key, scale, strength}`, plus a fourth,
differently derived estimate from chord detection (`chords_key`/
`chords_scale`, flat strings with no strength). The stored key is chosen by
majority vote among the three profiles rather than always trusting
key_edma -- a profile tuned specifically for electronic dance music, so
it's the one most likely to be the outlier in a non-EDM-heavy collection.
A disagreement against any of the four estimates is logged rather than
silently dropped. The TypeScript twin of this module is
`my-collection-search/src/lib/essentiaKey.ts`.
"""

from typing import Any

from .config import logger

_PROFILE_SOURCES = ("key_edma", "key_krumhansl", "key_temperley")


def _format_key(estimate: dict[str, Any] | None) -> str | None:
    if not estimate or not estimate.get("key") or not estimate.get("scale"):
        return None
    return f"{estimate['key']} {estimate['scale']}"


def _format_chords_key(tonal: dict[str, Any]) -> str | None:
    key = tonal.get("chords_key")
    scale = tonal.get("chords_scale")
    if not key or not scale:
        return None
    return f"{key} {scale}"


def _profile_candidates(tonal: dict[str, Any]) -> list[tuple[str, str, float | None]]:
    candidates = []
    for source in _PROFILE_SOURCES:
        formatted = _format_key(tonal.get(source))
        if formatted:
            strength = (tonal.get(source) or {}).get("strength")
            candidates.append((source, formatted, strength if isinstance(strength, (int, float)) else None))
    return candidates


def extract_key_analysis(tonal: dict[str, Any] | None) -> tuple[str | None, float | None]:
    """Chooses a key from the three independent key-detection profiles
    (key_edma/key_krumhansl/key_temperley) by majority vote, rather than
    always trusting key_edma (#524).

    `chords_key`/`chords_scale` never participates in the vote: it isn't a
    key-detection algorithm, just the most frequent chord root from chord
    detection, so it stays a diagnostic signal only (see
    `log_key_profile_disagreement`) rather than a fourth vote alongside
    three purpose-built estimators.

    With at most 3 candidates, at most one key/scale value can ever be
    shared by 2+ of them, so there's no tie to break when a majority
    exists -- its confidence is the average of just the agreeing
    strengths. Falling back (no two agree, or only one profile is present)
    picks the single highest-strength candidate, preferring edma >
    krumhansl > temperley when strength is missing or tied -- the same
    default order this pipeline always used.
    """
    tonal = tonal or {}
    candidates = _profile_candidates(tonal)
    if not candidates:
        return None, None

    groups: dict[str, list[tuple[str, str, float | None]]] = {}
    for candidate in candidates:
        groups.setdefault(candidate[1], []).append(candidate)

    majority = next((group for group in groups.values() if len(group) >= 2), None)
    if majority:
        strengths = [c[2] for c in majority if c[2] is not None]
        confidence = round(sum(strengths) / len(strengths), 3) if strengths else None
        return majority[0][1], confidence

    winner = max(candidates, key=lambda c: c[2] if c[2] is not None else float("-inf"))
    confidence = round(winner[2], 3) if winner[2] is not None else None
    return winner[1], confidence


def log_key_profile_disagreement(tonal: dict[str, Any] | None, track_id: str, friend_id: int) -> None:
    """Logs (never raises) when another key estimate disagrees with the key
    actually chosen by extract_key_analysis -- every independent estimate
    Essentia computed (the three profiles, plus chords_key), not just
    whichever one happened to be the default. On the track that prompted
    #524, the three key profiles (edma/krumhansl/temperley) all agreed with
    each other on F major -- the actual F-major/C-major split was against
    chords_key. A silent disagreement here is exactly what made that bug
    invisible."""
    tonal = tonal or {}
    key, _ = extract_key_analysis(tonal)
    if not key:
        return

    disagreements = []
    edma = _format_key(tonal.get("key_edma"))
    krumhansl = _format_key(tonal.get("key_krumhansl"))
    temperley = _format_key(tonal.get("key_temperley"))
    chords = _format_chords_key(tonal)
    if edma and edma != key:
        disagreements.append(f"edma={edma}")
    if krumhansl and krumhansl != key:
        disagreements.append(f"krumhansl={krumhansl}")
    if temperley and temperley != key:
        disagreements.append(f"temperley={temperley}")
    if chords and chords != key:
        disagreements.append(f"chords={chords}")

    if disagreements:
        logger.warning(
            "Key profile disagreement for track %s (friend %s): stored key=%s vs %s",
            track_id,
            friend_id,
            key,
            ", ".join(disagreements),
        )
