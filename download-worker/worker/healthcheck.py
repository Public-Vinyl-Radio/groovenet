"""Container HEALTHCHECK for the download worker.

Exits 0 if the worker loop has written a recent heartbeat to Redis, else 1.
The worker has no HTTP server, so liveness is signalled via a Redis key that
the main loop refreshes on every iteration (see worker.main).
"""

import os
import sys
import time

import redis

from .config import HEARTBEAT_KEY, HEARTBEAT_TTL


def check() -> int:
    max_age = HEARTBEAT_TTL * 2  # allow one missed refresh before failing
    try:
        conn = redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379"))
        raw = conn.get(HEARTBEAT_KEY)
    except Exception:
        return 1
    if raw is None:
        return 1
    try:
        age = time.time() - int(raw)
    except (TypeError, ValueError):
        return 1
    return 0 if age < max_age else 1


if __name__ == "__main__":
    sys.exit(check())
