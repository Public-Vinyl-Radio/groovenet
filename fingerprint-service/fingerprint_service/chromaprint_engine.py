"""Raw Chromaprint fingerprints from in-memory PCM.

`pyacoustid` is the standard binding, but its public API returns the compressed
base64 form meant for the AcoustID web service. We need the **raw 32-bit
values** — the inverted index in `index.py` is built on their top 28 bits, and
verification is a bit-error-rate over the full 32 — so this reaches past that
API to `chromaprint_get_raw_fingerprint`, declaring the signature itself.

Nothing here writes to disk or spawns a process. `decode_to_pcm` already put the
samples in memory, and at a 12 ms/window budget a subprocess per window would
cost more than the search it feeds. A whole set recording (#282) arrives as a
stream of chunks instead — see `fingerprint_stream`.
"""
import ctypes
from collections.abc import Callable, Iterable
from dataclasses import dataclass

try:  # pragma: no cover - exercised by the real import, not by a stub
    import chromaprint as _chromaprint
except ImportError as e:  # pragma: no cover
    raise ImportError(
        "libchromaprint is missing. It ships with the image; on macOS install it "
        "with `brew install chromaprint` and set "
        "DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib."
    ) from e

_lib = _chromaprint._libchromaprint

_lib.chromaprint_get_raw_fingerprint.argtypes = (
    ctypes.c_void_p,
    ctypes.POINTER(ctypes.POINTER(ctypes.c_uint32)),
    ctypes.POINTER(ctypes.c_int),
)
_lib.chromaprint_get_raw_fingerprint.restype = ctypes.c_int

#: Chromaprint emits one value per ~0.1238 s of audio, whatever the input rate:
#: it resamples to 11025 Hz internally, takes 4096-sample frames with 2/3
#: overlap, and so hops 1365 samples per value. Offsets come out of the search
#: in values, and this is what turns them into seconds — get it wrong and every
#: reported offset is scaled.
#:
#: Confirmed empirically against libchromaprint 1.6.1: a linear fit over 5–80 s
#: of audio gives 0.123762 s/value against the 0.123810 this computes.
SECONDS_PER_VALUE = 1365.0 / 11025.0

#: Chromaprint buffers roughly this much audio before emitting its first value,
#: so a window shorter than a few seconds fingerprints to nothing at all.
LEAD_IN_SECONDS = 2.65


class FingerprintError(RuntimeError):
    """The audio could not be fingerprinted."""


@dataclass(frozen=True)
class RawFingerprint:
    """A track or window as Chromaprint sees it: a run of 32-bit values."""

    values: tuple[int, ...]

    @property
    def duration_seconds(self) -> float:
        return len(self.values) * SECONDS_PER_VALUE

    @property
    def variety(self) -> float:
        """Fraction of values that are distinct, in [0, 1] (#306).

        Chromaprint describes how the spectrum *moves* — audio with no signal
        repeats the same value. A 15s silent window fingerprints to one to
        three distinct values out of roughly a hundred; real music gives
        98-100. Two silences are therefore not merely similar, they are
        identical: a true bit-error-rate of 0.0. This has to be checked before
        a query is ever searched, because no BER threshold can tell it apart
        from a real match.
        """
        if not self.values:
            return 0.0
        return len(set(self.values)) / len(self.values)

    def to_bytes(self) -> bytes:
        """Little-endian uint32s, as stored in `track_fingerprints`."""
        return b"".join(v.to_bytes(4, "little") for v in self.values)

    @classmethod
    def from_bytes(cls, blob: bytes) -> "RawFingerprint":
        if len(blob) % 4 != 0:
            raise FingerprintError(
                f"fingerprint blob is {len(blob)} bytes, not a whole number of uint32s"
            )
        return cls(
            tuple(
                int.from_bytes(blob[i : i + 4], "little") for i in range(0, len(blob), 4)
            )
        )


def fingerprint_pcm(pcm: bytes, sample_rate: int, channels: int = 1) -> RawFingerprint:
    """Fingerprint mono 16-bit PCM, returning the raw values.

    Short audio legitimately produces nothing: Chromaprint needs a few seconds
    before it emits its first value, so a sub-second window is not an error, it
    is simply unmatchable.
    """
    return fingerprint_stream((pcm,), sample_rate, channels)


def fingerprint_stream(
    chunks: Iterable[bytes], sample_rate: int, channels: int = 1
) -> RawFingerprint:
    """Fingerprint PCM that arrives in pieces, in one pass (#282).

    Chromaprint is incremental, so a three-hour set never has to be in memory
    at once — about 490 MB of samples at 22050 Hz, for a job that runs a
    couple of times a month. Feeding it in chunks gives byte-identical values
    to feeding it whole.

    Only Chromaprint's own failures become `FingerprintError`. Anything the
    chunk source raises — a decode that dies halfway, a timeout — propagates as
    itself, so the caller can still tell bad audio from a bad engine.
    """
    fingerprinter = _chromaprint.Fingerprinter()
    _guarded(fingerprinter.start, sample_rate, channels)
    for chunk in chunks:
        _guarded(fingerprinter.feed, chunk)
    _guarded(fingerprinter.finish)

    pointer = ctypes.POINTER(ctypes.c_uint32)()
    size = ctypes.c_int()
    ok = _guarded(
        _lib.chromaprint_get_raw_fingerprint,
        fingerprinter._ctx,
        ctypes.byref(pointer),
        ctypes.byref(size),
    )
    if not ok:
        raise FingerprintError("chromaprint refused to produce a fingerprint")
    return RawFingerprint(tuple(pointer[i] for i in range(size.value)))


def _guarded(call: Callable, *args):
    """Run one Chromaprint call, reporting any failure as `FingerprintError`."""
    try:
        return call(*args)
    except Exception as e:
        raise FingerprintError(f"chromaprint failed: {e}") from e


def library_version() -> str:
    """The libchromaprint version, for `fingerprint_version`."""
    _lib.chromaprint_get_version.restype = ctypes.c_char_p
    return _lib.chromaprint_get_version().decode()
