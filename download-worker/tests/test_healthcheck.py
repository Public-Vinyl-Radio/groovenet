import time

import pytest
import redis
from worker import healthcheck
from worker.config import HEARTBEAT_KEY, HEARTBEAT_TTL


@pytest.fixture
def redis_from_url(monkeypatch, fake_redis):
    """Point healthcheck.check() at the fake redis and record the URL it used."""
    urls = []

    def from_url(url, *a, **kw):
        urls.append(url)
        return fake_redis

    monkeypatch.setattr(healthcheck.redis, "from_url", from_url)
    return urls


def write_heartbeat(fake_redis, age_seconds=0):
    fake_redis.set(HEARTBEAT_KEY, int(time.time()) - age_seconds)


class TestCheck:
    def test_passes_on_a_fresh_heartbeat(self, redis_from_url, fake_redis):
        write_heartbeat(fake_redis)

        assert healthcheck.check() == 0

    def test_fails_when_no_heartbeat_was_ever_written(self, redis_from_url):
        assert healthcheck.check() == 1

    def test_tolerates_one_missed_refresh(self, redis_from_url, fake_redis):
        """max_age is HEARTBEAT_TTL * 2, so a single skipped write is survivable."""
        write_heartbeat(fake_redis, age_seconds=HEARTBEAT_TTL)

        assert healthcheck.check() == 0

    def test_fails_once_the_heartbeat_is_stale(self, redis_from_url, fake_redis):
        write_heartbeat(fake_redis, age_seconds=HEARTBEAT_TTL * 2 + 1)

        assert healthcheck.check() == 1

    def test_fails_on_a_non_numeric_heartbeat(self, redis_from_url, fake_redis):
        fake_redis.set(HEARTBEAT_KEY, "not-a-timestamp")

        assert healthcheck.check() == 1

    def test_fails_when_redis_is_unreachable(self, monkeypatch):
        def boom(*a, **kw):
            raise redis.ConnectionError("refused")

        monkeypatch.setattr(healthcheck.redis, "from_url", boom)

        assert healthcheck.check() == 1

    def test_fails_when_the_get_raises(self, monkeypatch):
        class Dead:
            def get(self, key):
                raise redis.ConnectionError("dropped mid-read")

        monkeypatch.setattr(healthcheck.redis, "from_url", lambda *a, **kw: Dead())

        assert healthcheck.check() == 1

    def test_defaults_to_the_compose_redis_host(self, redis_from_url, fake_redis, monkeypatch):
        monkeypatch.delenv("REDIS_URL", raising=False)
        write_heartbeat(fake_redis)

        healthcheck.check()

        assert redis_from_url == ["redis://redis:6379"]

    def test_honours_REDIS_URL(self, redis_from_url, fake_redis, monkeypatch):
        monkeypatch.setenv("REDIS_URL", "redis://elsewhere:6380/2")
        write_heartbeat(fake_redis)

        healthcheck.check()

        assert redis_from_url == ["redis://elsewhere:6380/2"]
