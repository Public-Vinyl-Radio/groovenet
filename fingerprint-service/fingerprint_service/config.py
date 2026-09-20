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

APP_URL = os.getenv('APP_URL', 'http://app:3000')
RESULT_TIMEOUT = int(os.getenv('FINGERPRINT_RESULT_TIMEOUT', '30'))

# Mounted directly into this container, unlike essentia-api, so jobs carry a
# path rather than a URL and nothing has to be re-served over HTTP (#269).
AUDIO_INGEST_DIR = os.getenv('AUDIO_INGEST_DIR', '/app/audio-ingest')

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
