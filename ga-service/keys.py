"""Musical keys: parsing, Camelot codes and the two distances the app's ranker uses."""

import re

_CAMELOT_RE = re.compile(r"^\s*(1[0-2]|[1-9])\s*([AB])\s*$", re.I)
_PITCH_CLASS = {
    "c": 0,
    "b#": 0,
    "c#": 1,
    "db": 1,
    "d": 2,
    "d#": 3,
    "eb": 3,
    "e": 4,
    "fb": 4,
    "e#": 5,
    "f": 5,
    "f#": 6,
    "gb": 6,
    "g": 7,
    "g#": 8,
    "ab": 8,
    "a": 9,
    "a#": 10,
    "bb": 10,
    "b": 11,
    "cb": 11,
}


def _parse_key(value):
    if not value:
        return None
    raw = str(value).strip()
    camelot = _CAMELOT_RE.match(raw)
    if camelot:
        return ("camelot", int(camelot.group(1)), camelot.group(2).upper())

    cleaned = raw.lower().replace(" major", "").replace(" minor", "m")
    cleaned = cleaned.replace("maj", "").replace("min", "m").replace(" ", "")
    mode = "minor" if cleaned.endswith("m") else "major"
    note = cleaned[:-1] if mode == "minor" else cleaned
    if note in _PITCH_CLASS:
        return ("basic", _PITCH_CLASS[note], mode)
    return None


def camelot_code(value):
    """`(number, letter)` on the Camelot wheel, e.g. `(8, "A")` for A minor; None when unknown."""
    parsed = _parse_key(value)
    if parsed is None:
        return None
    if parsed[0] == "camelot":
        return parsed[1], parsed[2]
    _, pitch_class, mode = parsed
    # C major is 8B and each fifth up is one step; a minor key shares its
    # relative major's number (A minor, 8A, with C major).
    major_pitch = pitch_class if mode == "major" else (pitch_class + 3) % 12
    number = (major_pitch * 7 + 7) % 12 + 1
    return number, "B" if mode == "major" else "A"


def wheel_distance(a, b):
    """Steps round the wheel, as the app's `camelotDistance`: relative major/minor is 1."""
    (num_a, letter_a), (num_b, letter_b) = a, b
    if letter_a == letter_b:
        diff = abs(num_a - num_b)
        return min(diff, 12 - diff)
    return 1 if num_a == num_b else 2


def camelot_distance(a, b):
    """The pre-scorer's distance: relative major/minor 0.5, a mode change adds 0.5."""
    (num_a, letter_a), (num_b, letter_b) = a, b
    if (num_a, letter_a) == (num_b, letter_b):
        return 0.0
    if num_a == num_b:
        return 0.5
    diff = abs(num_a - num_b)
    return min(diff, 12 - diff) + (0.0 if letter_a == letter_b else 0.5)
