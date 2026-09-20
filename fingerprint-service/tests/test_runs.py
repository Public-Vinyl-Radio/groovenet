"""Per-run progress counters (#277)."""
from fingerprint_service.runs import MAX_RECORDED_ERRORS, record_outcome, run_key


def outcome(status="indexed", error=None, run_id="run-1", track_id="track-1"):
    return {
        "run_id": run_id,
        "track_id": track_id,
        "friend_id": 1,
        "status": status,
        "error": error,
        "audio_sha256": "abc",
    }


class TestRecordOutcome:
    def test_increments_the_matching_counter(self, fake_redis):
        record_outcome(fake_redis, outcome("indexed"))
        record_outcome(fake_redis, outcome("indexed"))
        record_outcome(fake_redis, outcome("skipped"))

        stored = fake_redis.hgetall(run_key("run-1"))
        assert stored["indexed"] == "2"
        assert stored["skipped"] == "1"
        assert "failed" not in stored

    def test_stamps_an_updated_at(self, fake_redis):
        record_outcome(fake_redis, outcome())
        assert int(fake_redis.hget(run_key("run-1"), "updated_at")) > 0

    def test_keeps_runs_apart(self, fake_redis):
        record_outcome(fake_redis, outcome(run_id="run-1"))
        record_outcome(fake_redis, outcome(run_id="run-2"))

        assert fake_redis.hget(run_key("run-1"), "indexed") == "1"
        assert fake_redis.hget(run_key("run-2"), "indexed") == "1"

    def test_records_a_failure_message_against_the_track(self, fake_redis):
        record_outcome(fake_redis, outcome("failed", error="decode failed"))

        errors = fake_redis.lrange(f"{run_key('run-1')}:errors", 0, -1)
        assert errors == ["track-1: decode failed"]

    def test_caps_the_recorded_errors(self, fake_redis):
        for i in range(MAX_RECORDED_ERRORS + 25):
            record_outcome(
                fake_redis, outcome("failed", error="broken", track_id=f"track-{i}")
            )

        errors = fake_redis.lrange(f"{run_key('run-1')}:errors", 0, -1)
        assert len(errors) == MAX_RECORDED_ERRORS
        # The most recent survive; the earliest are trimmed away.
        assert errors[-1].startswith(f"track-{MAX_RECORDED_ERRORS + 24}:")

    def test_expires_the_run(self, fake_redis):
        record_outcome(fake_redis, outcome())
        assert fake_redis.ttl(run_key("run-1")) > 0

    def test_ignores_an_unknown_status(self, fake_redis):
        record_outcome(fake_redis, outcome("unindexable"))
        # Unindexable tracks are seeded by the app and never queued, so a job
        # claiming that status is a bug, not a counter to bump.
        assert fake_redis.hgetall(run_key("run-1")) == {}

    def test_a_redis_failure_is_not_fatal(self, fake_redis, monkeypatch):
        def explode():
            raise ConnectionError("redis is gone")

        monkeypatch.setattr(fake_redis, "pipeline", explode)
        record_outcome(fake_redis, outcome())  # must not raise
