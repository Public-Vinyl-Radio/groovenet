import logging
import os

import redis

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Live audio gets its own list. download_queue carries multi-minute downloads
# and would head-of-line block 15-second windows behind them (#276).
QUEUE_KEY = os.getenv('FINGERPRINT_QUEUE_KEY', 'fingerprint_queue')

# Reference-library indexing (#277) gets a third list rather than sharing either
# of the others. A full library pass is long work by the same argument that kept
# live chunks off download_queue, and keeping it separate lets the loop BRPOP
# both keys with QUEUE_KEY first: Redis returns the earliest non-empty key in
# argument order, so a live window preempts between two reference tracks instead
# of waiting out the whole pass.
INDEX_QUEUE_KEY = os.getenv('FINGERPRINT_INDEX_QUEUE_KEY', 'fingerprint_index_queue')

BRPOP_TIMEOUT = int(os.getenv('FINGERPRINT_BRPOP_TIMEOUT', '5'))

# redis-py 8 applies a 5s socket read timeout by default. Left alone that is
# exactly BRPOP_TIMEOUT, so on every idle cycle the socket read times out racing
# the server-side brpop timeout and the loop takes a TimeoutError instead of an
# empty result. Give the socket room to outlive the block it is waiting on.
SOCKET_TIMEOUT = BRPOP_TIMEOUT + 5

redis_conn = redis.from_url(
    os.getenv('REDIS_URL', 'redis://localhost:6379'),
    socket_timeout=SOCKET_TIMEOUT,
)

HEARTBEAT_KEY = os.getenv('FINGERPRINT_HEARTBEAT_KEY', 'fingerprint:heartbeat')
HEARTBEAT_TTL = int(os.getenv('FINGERPRINT_HEARTBEAT_TTL', '30'))

# The app has to know which engine and version it is resolving `--missing`
# against, and those values live on the matcher class here. Rather than copy
# them into the app's env — where a bump could silently miss one and index half
# the library under the wrong identity — the worker publishes them next to its
# heartbeat and the app reads them back. Same TTL, refreshed on the same cycle,
# so "engine unknown" and "worker down" are the same condition.
ENGINE_KEY = os.getenv('FINGERPRINT_ENGINE_KEY', 'fingerprint:engine')

APP_URL = os.getenv('APP_URL', 'http://app:3000')
RESULT_TIMEOUT = int(os.getenv('FINGERPRINT_RESULT_TIMEOUT', '30'))

# Mounted directly into this container, unlike essentia-api, so jobs carry a
# path rather than a URL and nothing has to be re-served over HTTP (#269).
AUDIO_INGEST_DIR = os.getenv('AUDIO_INGEST_DIR', '/app/audio-ingest')

# The reference library — `tracks.local_audio_url` is a filename inside it. A
# second direct mount for the same reason as the first: the indexer needs whole
# tracks, and re-serving 30 GB over HTTP to fingerprint it would be absurd.
AUDIO_DIR = os.getenv('AUDIO_DIR', '/app/audio')

#: Progress counters for one indexing run live under this prefix, written by
#: this service and read back by the app (#277). Redis rather than Postgres
#: because they are transient and updated once per track.
INDEX_RUN_KEY_PREFIX = os.getenv('FINGERPRINT_INDEX_RUN_PREFIX', 'fpindex:run:')

#: How long a finished run's counters stick around for the CLI to read.
INDEX_RUN_TTL = int(os.getenv('FINGERPRINT_INDEX_RUN_TTL', '86400'))

#: Streaming read size when hashing reference audio. Tracks run to tens of MB;
#: reading one whole into memory to sha256 it would be pointless.
HASH_CHUNK_SIZE = int(os.getenv('FINGERPRINT_HASH_CHUNK_SIZE', str(1024 * 1024)))

MATCHER_NAME = os.getenv('FINGERPRINT_MATCHER', 'stub')

FFMPEG_TIMEOUT = int(os.getenv('FINGERPRINT_FFMPEG_TIMEOUT', '60'))

#: Chromaprint resamples internally, so anything above 22050 Hz only costs
#: decode time. 44100 stays available for engines that want the full band.
SUPPORTED_SAMPLE_RATES = (22050, 44100)


def resolve_sample_rate(raw: str | None = None) -> int:
    """Validate the configured decode rate, failing loudly on a bad value.

    Called at import so a typo in the env crashes the container with a legible
    message instead of failing every job identically for the lifetime of the
    deployment.
    """
    value = os.getenv('FINGERPRINT_SAMPLE_RATE', '22050') if raw is None else raw
    try:
        rate = int(value)
    except (TypeError, ValueError):
        raise ValueError(
            f"FINGERPRINT_SAMPLE_RATE must be an integer, got {value!r}"
        ) from None
    if rate not in SUPPORTED_SAMPLE_RATES:
        raise ValueError(
            f"FINGERPRINT_SAMPLE_RATE must be one of {SUPPORTED_SAMPLE_RATES}, got {rate}"
        )
    return rate


SAMPLE_RATE = resolve_sample_rate()
