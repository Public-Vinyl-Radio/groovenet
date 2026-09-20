"""Container HEALTHCHECK for the fingerprint service.

Exits 0 if the loop has written a recent heartbeat to Redis, else 1. The
service is queue-driven and publishes no port, so there is no endpoint to
probe — liveness is a key the main loop refreshes on every iteration.
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
