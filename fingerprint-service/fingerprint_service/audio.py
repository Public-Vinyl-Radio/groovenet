"""Decode an ingested chunk to the one representation the matcher understands.

Every engine wants raw samples, not a container, so normalization happens once
here and the result is passed around in memory. Nothing is written back to
disk: the ingest volume holds the original upload until the app sweeps it
(#269), and a second copy of the same audio would only be one more thing to
clean up.
"""
import os
import shlex
import subprocess
import tempfile
import threading
from collections.abc import Iterator
from dataclasses import dataclass

import numpy as np

from .config import (
    FFMPEG_TIMEOUT,
    PCM_CHUNK_BYTES,
    SAMPLE_RATE,
    SUPPORTED_SAMPLE_RATES,
    logger,
)

#: 16-bit samples.
BYTES_PER_SAMPLE = 2

#: How much shorter than its declared duration a decode may come out before it
#: is treated as a truncated upload rather than a rounding difference.
DURATION_TOLERANCE = 0.1


class AudioDecodeError(RuntimeError):
    """The chunk could not be turned into usable samples."""


@dataclass(frozen=True)
class NormalizedAudio:
    """Mono signed 16-bit little-endian PCM at a known sample rate."""

    pcm: bytes
    sample_rate: int

    @property
    def sample_count(self) -> int:
        return len(self.pcm) // BYTES_PER_SAMPLE

    @property
    def duration_seconds(self) -> float:
        return self.sample_count / self.sample_rate


def _run_ffmpeg(cmd: list[str], timeout: int) -> subprocess.CompletedProcess:
    """Run ffmpeg capturing stdout as bytes.

    Deliberately not `download-worker`'s `run_subprocess`: that decodes stdout
    as text, which would corrupt PCM.
    """
    logger.info("Executing command: %s", " ".join(shlex.quote(part) for part in cmd))
    try:
        return subprocess.run(
            cmd,
            capture_output=True,
            timeout=timeout,
            stdin=subprocess.DEVNULL,
        )
    except subprocess.TimeoutExpired as e:
        raise AudioDecodeError(f"ffmpeg timed out after {timeout}s") from e
    except FileNotFoundError as e:
        raise AudioDecodeError("ffmpeg is not installed in this image") from e


def decode_to_pcm(
    file_path: str,
    sample_rate: int = SAMPLE_RATE,
    *,
    declared_duration: float | None = None,
    timeout: int = FFMPEG_TIMEOUT,
) -> NormalizedAudio:
    """Decode any container ffmpeg can read to mono PCM at `sample_rate`.

    `declared_duration` is what the ingest route measured at upload time (#275).
    When it is given, a decode that comes back materially shorter is rejected:
    that is what a half-written file looks like, and handing one to the matcher
    would produce a confident answer about the wrong few seconds.
    """
    cmd = _decode_command(file_path, sample_rate)
    result = _run_ffmpeg(cmd, timeout)

    stderr = result.stderr.decode("utf-8", errors="replace").strip()
    if result.returncode != 0:
        raise AudioDecodeError(f"ffmpeg exited {result.returncode}: {stderr or 'no output'}")
    if stderr:
        # ffmpeg at -v error still talks about recoverable damage.
        logger.warning("ffmpeg reported while decoding %s: %s", file_path, stderr)

    audio = NormalizedAudio(pcm=result.stdout, sample_rate=sample_rate)
    if audio.sample_count == 0:
        raise AudioDecodeError(f"decoded no audio from {file_path}")

    _check_duration(file_path, audio, declared_duration)
    logger.info(
        "Decoded %s to %.2fs of mono PCM at %d Hz",
        file_path,
        audio.duration_seconds,
        sample_rate,
    )
    return audio


def stream_pcm(
    file_path: str,
    sample_rate: int = SAMPLE_RATE,
    *,
    timeout: int,
    chunk_bytes: int = PCM_CHUNK_BYTES,
) -> Iterator[bytes]:
    """Decode like `decode_to_pcm`, but yield the samples as they arrive (#282).

    For a whole set recording: three hours is ~490 MB of PCM, and nothing
    downstream needs it all at once. Failures surface from the iterator — a
    decode that dies halfway raises after the chunks it did produce, so the
    consumer must treat the stream as all-or-nothing.

    stderr goes to a temp file rather than a pipe: nobody reads it until the
    end, and a full pipe would block ffmpeg mid-decode. The timeout is a timer
    that kills the process, because a read blocked on a hung ffmpeg would
    otherwise never return to check a clock.
    """
    cmd = _decode_command(file_path, sample_rate)
    logger.info("Streaming command: %s", " ".join(shlex.quote(part) for part in cmd))

    with tempfile.TemporaryFile() as stderr_file:
        try:
            process = subprocess.Popen(
                cmd,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=stderr_file,
            )
        except FileNotFoundError as e:
            raise AudioDecodeError("ffmpeg is not installed in this image") from e

        timed_out = threading.Event()

        def expire() -> None:
            timed_out.set()
            process.kill()

        timer = threading.Timer(timeout, expire)
        timer.start()
        produced = 0
        try:
            while chunk := process.stdout.read(chunk_bytes):
                produced += len(chunk)
                yield chunk
            returncode = process.wait()
        finally:
            timer.cancel()
            if process.poll() is None:
                process.kill()
                process.wait()
            process.stdout.close()

        stderr_file.seek(0)
        stderr = stderr_file.read().decode("utf-8", errors="replace").strip()

    if timed_out.is_set():
        raise AudioDecodeError(f"ffmpeg timed out after {timeout}s")
    if returncode != 0:
        raise AudioDecodeError(f"ffmpeg exited {returncode}: {stderr or 'no output'}")
    if stderr:
        logger.warning("ffmpeg reported while decoding %s: %s", file_path, stderr)
    if produced == 0:
        raise AudioDecodeError(f"decoded no audio from {file_path}")
    logger.info(
        "Streamed %s as %.2fs of mono PCM at %d Hz",
        file_path,
        produced / BYTES_PER_SAMPLE / sample_rate,
        sample_rate,
    )


def _decode_command(file_path: str, sample_rate: int) -> list[str]:
    """The one ffmpeg invocation both decoders share, after checking inputs."""
    if sample_rate not in SUPPORTED_SAMPLE_RATES:
        raise AudioDecodeError(
            f"sample rate {sample_rate} is not one of {SUPPORTED_SAMPLE_RATES}"
        )
    if not os.path.isfile(file_path):
        raise AudioDecodeError(f"no such file: {file_path}")
    return [
        "ffmpeg",
        "-nostdin",
        "-v", "error",
        "-i", file_path,
        "-vn",                       # cover art in a FLAC is a video stream
        "-map", "0:a:0",             # first audio stream only
        "-ac", "1",
        "-ar", str(sample_rate),
        "-f", "s16le",
        "-",
    ]


def _check_duration(
    file_path: str,
    audio: NormalizedAudio,
    declared_duration: float | None,
) -> None:
    if not declared_duration or declared_duration <= 0:
        return
    floor = declared_duration * (1 - DURATION_TOLERANCE)
    if audio.duration_seconds < floor:
        raise AudioDecodeError(
            f"{file_path} decoded to {audio.duration_seconds:.2f}s but was ingested as "
            f"{declared_duration:.2f}s; treating it as a truncated upload"
        )
    if audio.duration_seconds > declared_duration * (1 + DURATION_TOLERANCE):
        logger.warning(
            "%s decoded to %.2fs, longer than its ingested duration %.2fs",
            file_path,
            audio.duration_seconds,
            declared_duration,
        )


#: What `level_dbfs` reports for true digital silence, where the RMS is 0 and
#: the log is minus infinity — which JSON cannot carry.
SILENCE_DBFS = -120.0


def level_dbfs(pcm: bytes) -> float:
    """RMS level of mono 16-bit PCM, in dB relative to full scale.

    0 is a full-scale square wave; music on vinyl typically sits around -30 to
    -15; an idle chain's hiss is far lower. Rounded to 0.1 dB, and floored at
    SILENCE_DBFS for all-zero audio.
    """
    samples = np.frombuffer(pcm[: len(pcm) - len(pcm) % BYTES_PER_SAMPLE], dtype="<i2")
    if samples.size == 0:
        return SILENCE_DBFS
    rms = float(np.sqrt(np.mean(samples.astype(np.float64) ** 2)))
    if rms == 0:
        return SILENCE_DBFS
    return round(max(20 * np.log10(rms / 32768.0), SILENCE_DBFS), 1)
