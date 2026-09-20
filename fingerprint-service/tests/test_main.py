import json

import pytest
import redis
from fingerprint_service import main as service_main
from fingerprint_service.audio import AudioDecodeError, NormalizedAudio
from fingerprint_service.main import (
    InvalidJob,
    parse_job,
    process_job,
    resolve_ingest_path,
    run_once,
    verify_redis,
    write_heartbeat,
)
from fingerprint_service.matcher import StubMatcher


@pytest.fixture
def reported(monkeypatch):
    """Capture results instead of posting them."""
    sent = []
    monkeypatch.setattr(
        service_main, "try_report_result", lambda result: sent.append(result) or True
    )
    return sent


@pytest.fixture
def decoded(monkeypatch):
    """Return fixed audio instead of shelling out to ffmpeg."""
    audio = NormalizedAudio(pcm=b"\x00\x00" * 22050 * 15, sample_rate=22050)
    monkeypatch.setattr(service_main, "decode_to_pcm", lambda *a, **k: audio)
    return audio


@pytest.fixture
def matcher():
    return StubMatcher()


class TestParseJob:
    def test_accepts_a_well_formed_payload(self, job):
        payload = job()
        assert parse_job(json.dumps(payload)) == payload

    def test_rejects_json_that_is_not_an_object(self):
        with pytest.raises(InvalidJob, match="expected a JSON object"):
            parse_job("[1, 2, 3]")

    @pytest.mark.parametrize("field", ["ingest_id", "source_id", "file_path"])
    def test_rejects_a_payload_missing_a_required_field(self, job, field):
        payload = job()
        del payload[field]
        with pytest.raises(InvalidJob, match=field):
            parse_job(json.dumps(payload))

    def test_names_every_missing_field_at_once(self, job):
        with pytest.raises(InvalidJob, match="ingest_id, source_id, file_path"):
            parse_job(json.dumps({"sequence": 1}))

    def test_rejects_an_empty_required_field(self, job):
        with pytest.raises(InvalidJob, match="file_path"):
            parse_job(json.dumps(job(file_path="")))

    def test_optional_fields_may_be_absent(self):
        payload = {"ingest_id": "i1", "source_id": "s1", "file_path": "c.wav"}
        assert parse_job(json.dumps(payload)) == payload

    def test_invalid_json_raises_a_decode_error(self):
        with pytest.raises(json.JSONDecodeError):
            parse_job("{not json")


class TestResolveIngestPath:
    def test_resolves_a_relative_path_against_the_ingest_volume(self, ingest_dir):
        assert resolve_ingest_path("chunk.wav") == str(ingest_dir / "chunk.wav")

    def test_accepts_an_absolute_path_inside_the_volume(self, ingest_dir):
        inside = str(ingest_dir / "nested" / "chunk.wav")
        assert resolve_ingest_path(inside) == inside

    @pytest.mark.parametrize("path", ["../../etc/passwd", "/etc/passwd"])
    def test_refuses_a_path_outside_the_volume(self, ingest_dir, path):
        with pytest.raises(InvalidJob, match="resolves outside"):
            resolve_ingest_path(path)


class TestVerifyRedis:
    def test_true_when_redis_answers(self, fake_redis):
        assert verify_redis() is True

    def test_false_when_redis_does_not(self, monkeypatch):
        class Dead:
            def ping(self):
                raise redis.ConnectionError("refused")

        monkeypatch.setattr(service_main, "redis_conn", Dead())
        assert verify_redis() is False


class TestWriteHeartbeat:
    def test_writes_a_key_with_a_ttl(self, fake_redis):
        write_heartbeat()
        assert fake_redis.get(service_main.HEARTBEAT_KEY) is not None
        assert 0 < fake_redis.ttl(service_main.HEARTBEAT_KEY) <= service_main.HEARTBEAT_TTL

    def test_a_failure_is_logged_not_raised(self, monkeypatch, caplog):
        class Dead:
            def set(self, *args, **kwargs):
                raise redis.ConnectionError("refused")

        monkeypatch.setattr(service_main, "redis_conn", Dead())
        write_heartbeat()
        assert "Failed to write heartbeat" in caplog.text


class TestProcessJob:
    def test_decodes_matches_and_reports(self, job, wav_file, matcher, decoded, reported):
        wav_file()
        result = process_job(json.dumps(job()), matcher)

        assert result["status"] == "processed"
        assert result["candidates"] == []
        assert result["duration_seconds"] == pytest.approx(15.0)
        assert result["sample_rate"] == 22050
        assert reported == [result]

    def test_reports_the_candidates_the_matcher_found(self, job, wav_file, decoded, reported):
        wav_file()
        candidate = {
            "track_id": "13916746-A6",
            "friend_id": 1,
            "confidence": 0.94,
            "offset_seconds": 12.4,
        }
        result = process_job(json.dumps(job()), StubMatcher([candidate]))
        assert result["candidates"] == [candidate]

    def test_passes_the_ingested_duration_to_the_decoder(self, job, wav_file, matcher, reported, monkeypatch):
        wav_file()
        seen = {}

        def capture(path, rate, declared_duration=None):
            seen.update(path=path, rate=rate, declared_duration=declared_duration)
            return NormalizedAudio(pcm=b"\x00\x00" * 100, sample_rate=rate)

        monkeypatch.setattr(service_main, "decode_to_pcm", capture)
        process_job(json.dumps(job(duration_seconds=15.0)), matcher)
        assert seen["declared_duration"] == 15.0
        assert seen["path"].endswith("chunk.wav")

    def test_malformed_json_is_logged_and_skipped(self, matcher, reported, caplog):
        assert process_job("{not json", matcher) is None
        assert "Failed to parse job JSON" in caplog.text
        assert reported == [], "there is no ingest to report against"

    def test_a_job_missing_required_fields_is_logged_and_skipped(self, matcher, reported, caplog):
        assert process_job(json.dumps({"source_id": "s1"}), matcher) is None
        assert "Skipping malformed job" in caplog.text
        assert reported == []

    def test_a_decode_failure_is_reported_as_failed(self, job, wav_file, matcher, reported, monkeypatch):
        wav_file()

        def boom(*args, **kwargs):
            raise AudioDecodeError("truncated upload")

        monkeypatch.setattr(service_main, "decode_to_pcm", boom)
        result = process_job(json.dumps(job()), matcher)

        assert result["status"] == "failed"
        assert result["error"] == "truncated upload"
        assert reported == [result], "the app is waiting on a terminal state to release the file"

    def test_a_missing_file_is_reported_as_failed(self, job, ingest_dir, matcher, reported):
        result = process_job(json.dumps(job(file_path="gone.wav")), matcher)
        assert result["status"] == "failed"
        assert "no such file" in result["error"]

    def test_a_path_outside_the_volume_is_reported_as_failed(
        self, job, ingest_dir, matcher, reported, caplog
    ):
        result = process_job(json.dumps(job(file_path="../escape.wav")), matcher)
        assert result["status"] == "failed"
        assert "resolves outside" in result["error"]
        assert "Traceback" not in caplog.text, "a rejection is not a crash"

    def test_a_matcher_that_raises_is_reported_as_failed(self, job, wav_file, decoded, reported):
        class Exploding(StubMatcher):
            def match(self, audio):
                raise RuntimeError("index not loaded")

        wav_file()
        result = process_job(json.dumps(job()), Exploding())
        assert result["status"] == "failed"
        assert result["error"] == "index not loaded"


class TestRunOnce:
    def test_heartbeats_even_with_an_empty_queue(self, fake_redis, matcher, monkeypatch):
        monkeypatch.setattr(service_main, "BRPOP_TIMEOUT", 0.01)
        run_once(matcher)
        assert fake_redis.get(service_main.HEARTBEAT_KEY) is not None

    def test_handles_a_queued_job(self, fake_redis, job, wav_file, matcher, decoded, reported, monkeypatch):
        monkeypatch.setattr(service_main, "BRPOP_TIMEOUT", 0.01)
        wav_file()
        fake_redis.lpush(service_main.QUEUE_KEY, json.dumps(job()))

        run_once(matcher)

        assert len(reported) == 1
        assert reported[0]["status"] == "processed"
        assert fake_redis.llen(service_main.QUEUE_KEY) == 0

    def test_one_bad_job_does_not_stop_the_next_one(
        self, fake_redis, job, wav_file, matcher, decoded, reported, monkeypatch
    ):
        monkeypatch.setattr(service_main, "BRPOP_TIMEOUT", 0.01)
        wav_file()
        # rpush/brpop is FIFO: the malformed payload is taken first.
        fake_redis.rpush(service_main.QUEUE_KEY, "{not json")
        fake_redis.rpush(service_main.QUEUE_KEY, json.dumps(job()))

        run_once(matcher)
        run_once(matcher)

        assert [r["status"] for r in reported] == ["processed"]


class TestMain:
    def test_stops_when_redis_is_unreachable(self, monkeypatch):
        monkeypatch.setattr(service_main, "verify_redis", lambda: False)
        called = []
        monkeypatch.setattr(service_main, "run_once", lambda m: called.append(m))
        service_main.main()
        assert called == []

    def test_backs_off_and_continues_on_a_connection_error(self, monkeypatch):
        monkeypatch.setattr(service_main, "verify_redis", lambda: True)
        sleeps = []
        monkeypatch.setattr(service_main.time, "sleep", lambda s: sleeps.append(s))

        outcomes = iter([redis.ConnectionError("gone"), RuntimeError("odd"), KeyboardInterrupt()])

        def flaky(matcher):
            raise next(outcomes)

        monkeypatch.setattr(service_main, "run_once", flaky)
        service_main.main()

        assert sleeps == [5, 1], "connection errors back off longer than other failures"

    def test_refuses_to_start_with_an_unknown_matcher(self, monkeypatch):
        monkeypatch.setattr(service_main, "verify_redis", lambda: True)
        monkeypatch.setattr(service_main, "MATCHER_NAME", "panako")
        with pytest.raises(ValueError, match="unknown matcher"):
            service_main.main()
