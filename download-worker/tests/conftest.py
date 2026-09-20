import subprocess

import fakeredis
import pytest


@pytest.fixture
def fake_redis():
    server = fakeredis.FakeServer()
    return fakeredis.FakeRedis(server=server, decode_responses=True)


@pytest.fixture(autouse=True)
def patch_redis(fake_redis, monkeypatch):
    """Replace the module-level redis_conn in every module that holds a reference."""
    monkeypatch.setattr("worker.redis_utils.redis_conn", fake_redis)
    monkeypatch.setattr("worker.main.redis_conn", fake_redis)


@pytest.fixture
def completed_process():
    """Factory for subprocess.CompletedProcess with configurable fields."""
    def _make(returncode=0, stdout="", stderr=""):
        return subprocess.CompletedProcess(args=[], returncode=returncode, stdout=stdout, stderr=stderr)
    return _make
