import json

from worker.config import (
    JOB_TTL_ACTIVE_SECONDS,
    JOB_TTL_TERMINAL_SECONDS,
    JOBS_UPDATED_INDEX_KEY,
)
from worker.redis_utils import append_job_logs, update_job_status


def test_update_job_status_sets_hash_fields(fake_redis):
    update_job_status("job-1", "processing", progress=42)
    data = fake_redis.hgetall("job:job-1")
    assert data["status"] == "processing"
    assert data["progress"] == "42"
    assert "updated_at" in data


def test_update_job_status_adds_to_sorted_set(fake_redis):
    update_job_status("job-2", "queued")
    members = fake_redis.zrange(JOBS_UPDATED_INDEX_KEY, 0, -1)
    assert "job-2" in members


def test_update_job_status_stores_error(fake_redis):
    update_job_status("job-3", "failed", error="something broke")
    data = fake_redis.hgetall("job:job-3")
    assert data["error"] == "something broke"


def test_update_job_status_serialises_result(fake_redis):
    update_job_status("job-4", "completed", result={"track_id": "abc", "success": True})
    data = fake_redis.hgetall("job:job-4")
    parsed = json.loads(data["result"])
    assert parsed["track_id"] == "abc"
    assert parsed["success"] is True


def test_update_job_status_active_ttl(fake_redis):
    update_job_status("job-5", "processing")
    ttl = fake_redis.ttl("job:job-5")
    assert ttl == JOB_TTL_ACTIVE_SECONDS


def test_update_job_status_terminal_ttl(fake_redis):
    for status in ("completed", "failed"):
        job_id = f"job-{status}"
        update_job_status(job_id, status)
        ttl = fake_redis.ttl(f"job:{job_id}")
        assert ttl == JOB_TTL_TERMINAL_SECONDS


def test_append_job_logs_pushes_lines(fake_redis):
    append_job_logs("job-6", ["line one", "line two", "line three"])
    items = fake_redis.lrange("job:job-6:logs", 0, -1)
    assert items == ["line one", "line two", "line three"]


def test_append_job_logs_sets_ttl(fake_redis):
    append_job_logs("job-7", ["msg"])
    ttl = fake_redis.ttl("job:job-7:logs")
    assert ttl == JOB_TTL_ACTIVE_SECONDS


def test_append_job_logs_empty_list_is_noop(fake_redis):
    append_job_logs("job-8", [])
    assert not fake_redis.exists("job:job-8:logs")


def test_append_job_logs_multiple_calls_accumulate(fake_redis):
    append_job_logs("job-9", ["a", "b"])
    append_job_logs("job-9", ["c"])
    items = fake_redis.lrange("job:job-9:logs", 0, -1)
    assert items == ["a", "b", "c"]


def test_enqueue_analyze_job_writes_job_and_queues_payload(fake_redis):
    import json

    from worker.redis_utils import enqueue_analyze_job

    job_id = enqueue_analyze_job("t1", 7, "t1.m4a")
    assert json.loads(fake_redis.rpop("download_queue")) == {
        "job_id": job_id,
        "job_type": "analyze-local",
        "track_id": "t1",
        "friend_id": 7,
        "local_audio_url": "t1.m4a",
    }
    job = fake_redis.hgetall(f"job:{job_id}")
    assert job["status"] == "queued" and job["name"] == "analyze-local-audio"
    assert fake_redis.ttl(f"job:{job_id}") > 0
