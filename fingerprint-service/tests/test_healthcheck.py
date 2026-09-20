import time

import pytest
import redis
from fingerprint_service import healthcheck
from fingerprint_service.healthcheck import check


@pytest.fixture
def heartbeat(fake_redis, monkeypatch):
    """Serve the healthcheck's own Redis connection from fakeredis."""
    monkeypatch.setattr(healthcheck.redis, "from_url", lambda url: fake_redis)
    return fake_redis


class TestCheck:
    def test_healthy_with_a_fresh_heartbeat(self, heartbeat):
        heartbeat.set(healthcheck.HEARTBEAT_KEY, int(time.time()))
        assert check() == 0

    def test_healthy_after_one_missed_refresh(self, heartbeat):
        age = healthcheck.HEARTBEAT_TTL + 1
        heartbeat.set(healthcheck.HEARTBEAT_KEY, int(time.time()) - age)
        assert check() == 0

    def test_unhealthy_once_the_heartbeat_is_stale(self, heartbeat):
        age = healthcheck.HEARTBEAT_TTL * 2 + 1
        heartbeat.set(healthcheck.HEARTBEAT_KEY, int(time.time()) - age)
        assert check() == 1

    def test_unhealthy_before_the_first_heartbeat(self, heartbeat):
        assert check() == 1

    def test_unhealthy_when_the_key_is_not_a_timestamp(self, heartbeat):
        heartbeat.set(healthcheck.HEARTBEAT_KEY, "soon")
        assert check() == 1

    def test_unhealthy_when_redis_is_unreachable(self, monkeypatch):
        def boom(url):
            raise redis.ConnectionError("refused")

        monkeypatch.setattr(healthcheck.redis, "from_url", boom)
        assert check() == 1
