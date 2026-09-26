import json
import time

import pytest
import redis
from fingerprint_service import main as service_main
from fingerprint_service.audio import AudioDecodeError, NormalizedAudio
from fingerprint_service.main import (
    InvalidJob,
    heartbeat_while_busy,
    parse_job,
    process_index_job,
    process_job,
    publish_engine,
    refresh_reference_index,
    reset_index_clock,
    resolve_ingest_path,
    run_once,
    verify_redis,
    write_heartbeat,
)
from fingerprint_service.matcher import StubMatcher
from fingerprint_service.reference_index import ReferenceIndex


@pytest.fixture
def reported(monkeypatch):
    """Capture results instead of posting them."""
    sent = []
    monkeypatch.setattr(
        service_main, "try_report_result", lambda result: sent.append(result) or True
    )
    return sent


@pytest.fixture(autouse=True)
def claimed(monkeypatch):
    """Swallow the claim call.

    `process_job` announces its pickup over HTTP; without this every test
    attempts a real connection to the app host and waits for it to fail.
    """
    calls = []
    monkeypatch.setattr(
        service_main, "try_claim_ingest", lambda ingest_id: calls.append(ingest_id) or True
    )
    return calls


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


class TestClaiming:
    """The pickup announcement that makes `processing` a real state (#276)."""

    def test_claims_before_doing_the_work(self, job, wav_file, matcher, decoded, reported, claimed):
        wav_file()
        process_job(json.dumps(job()), matcher)

        assert claimed == ["11111111-1111-1111-1111-111111111111"]

    def test_does_not_claim_a_payload_it_cannot_identify(self, matcher, claimed):
        # Nothing to claim against, and nothing to report either.
        process_job("{not json", matcher)
        assert claimed == []

    def test_still_reports_when_the_claim_fails(self, job, wav_file, matcher, decoded, reported, monkeypatch):
        # Losing a claim costs diagnosis, not the result.
        monkeypatch.setattr(service_main, "try_claim_ingest", lambda _id: False)
        wav_file()

        process_job(json.dumps(job()), matcher)

        assert len(reported) == 1


class TestSilenceFloor:
    """Windows too quiet to be music are not matched (#282 follow-up)."""

    class Counting(StubMatcher):
        def __init__(self):
            super().__init__([{"track_id": "t", "friend_id": 1, "confidence": 0.876, "offset_seconds": 428.0}])
            self.calls = 0

        def match(self, audio):
            self.calls += 1
            return super().match(audio)

    def test_reports_every_window_s_level(self, job, wav_file, matcher, decoded, reported):
        wav_file()
        result = process_job(json.dumps(job()), matcher)
        # `decoded` is all zeros: digital silence.
        assert result["level_dbfs"] == -120.0

    def test_off_by_default_so_even_silence_is_matched(self, job, wav_file, decoded, reported, monkeypatch):
        monkeypatch.setattr(service_main, "MIN_LEVEL_DBFS", None)
        wav_file()
        matcher = self.Counting()
        result = process_job(json.dumps(job()), matcher)
        assert matcher.calls == 1
        assert result["candidates"]

    def test_a_window_under_the_floor_is_a_no_match_without_asking_the_matcher(
        self, job, wav_file, decoded, reported, monkeypatch, caplog
    ):
        monkeypatch.setattr(service_main, "MIN_LEVEL_DBFS", -60.0)
        caplog.set_level("INFO")
        wav_file()
        matcher = self.Counting()

        result = process_job(json.dumps(job()), matcher)

        assert matcher.calls == 0
        assert result["status"] == "processed"
        assert result["candidates"] == []
        assert result["level_dbfs"] == -120.0
        assert "under the -60.0 dBFS floor" in caplog.text

    def test_a_window_over_the_floor_is_matched(self, job, wav_file, reported, monkeypatch):
        monkeypatch.setattr(service_main, "MIN_LEVEL_DBFS", -60.0)
        loud = NormalizedAudio(pcm=b"\xff\x7f\x00\x80" * 22050, sample_rate=22050)
        monkeypatch.setattr(service_main, "decode_to_pcm", lambda *a, **k: loud)
        wav_file()
        matcher = self.Counting()

        result = process_job(json.dumps(job()), matcher)

        assert matcher.calls == 1
        assert result["level_dbfs"] == pytest.approx(0.0, abs=0.1)

    def test_an_undecodable_chunk_has_no_level(self, job, wav_file, matcher, reported, monkeypatch):
        def fail(*args, **kwargs):
            raise AudioDecodeError("moov atom not found")

        monkeypatch.setattr(service_main, "decode_to_pcm", fail)
        wav_file()
        result = process_job(json.dumps(job()), matcher)
        assert result["status"] == "failed"
        assert result["level_dbfs"] is None


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

    def test_malformed_json_is_logged_and_skipped(self, matcher, reported, events):
        assert process_job("{not json", matcher) is None
        [skipped] = events("ingest.skipped")
        assert skipped["stage"] == "parse"
        assert reported == [], "there is no ingest to report against"

    def test_a_job_missing_required_fields_is_logged_and_skipped(self, matcher, reported, events):
        assert process_job(json.dumps({"source_id": "s1"}), matcher) is None
        [skipped] = events("ingest.skipped")
        assert skipped["stage"] == "parse"
        assert "missing required field" in skipped["error"]
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


class TestIngestEvents:
    """The structured lines one chunk leaves behind (#280)."""

    def test_a_chunk_logs_picked_up_then_processed(self, job, wav_file, decoded, reported, events):
        wav_file()
        candidate = {"track_id": "13916746-A6", "friend_id": 1, "confidence": 0.94, "offset_seconds": 12.4}
        process_job(json.dumps(job()), StubMatcher([candidate]))

        assert [line["event"] for line in events()] == ["ingest.picked_up", "ingest.processed"]
        picked_up, processed = events()
        for line in (picked_up, processed):
            assert line["ingest_id"] == job()["ingest_id"]
            assert line["source_id"] == "living-room-vinyl"
            assert line["session_id"] == "session-1"
            assert line["sequence"] == 7
            assert line["component"] == "fingerprint-service"
        assert processed["status"] == "processed"
        assert processed["candidates"] == 1
        assert processed["track_id"] == "13916746-A6"
        assert processed["confidence"] == 0.94
        assert processed["sample_rate"] == 22050
        assert processed["codec"] == "pcm_s16le"
        for timing in ("decode_ms", "match_ms", "processing_ms"):
            assert isinstance(processed[timing], int)

    def test_a_no_match_window_is_processed_not_failed(self, job, wav_file, matcher, decoded, reported, events):
        wav_file()
        process_job(json.dumps(job()), matcher)
        [processed] = events("ingest.processed")
        assert processed["candidates"] == 0
        assert "stage" not in processed or processed["stage"] is None

    def test_queue_wait_comes_from_the_enqueue_stamp(self, job, wav_file, matcher, decoded, reported, events):
        wav_file()
        process_job(json.dumps(job(enqueued_at="2000-01-01T00:00:00Z")), matcher)
        [picked_up] = events("ingest.picked_up")
        assert picked_up["queue_wait_ms"] > 0
        assert picked_up["queue"] == service_main.QUEUE_KEY

    def test_a_decode_failure_names_the_decode_stage(self, job, wav_file, matcher, reported, events, monkeypatch):
        wav_file()

        def boom(*args, **kwargs):
            raise AudioDecodeError("truncated upload")

        monkeypatch.setattr(service_main, "decode_to_pcm", boom)
        result = process_job(json.dumps(job()), matcher)

        assert result["error_stage"] == "decode", "the app logs the stage it is told"
        [failed] = events("ingest.failed")
        assert failed["stage"] == "decode"
        assert failed["level"] == "error"
        assert failed["error"] == "truncated upload"

    def test_an_unexpected_decode_crash_still_names_the_decode_stage(
        self, job, wav_file, matcher, reported, events, monkeypatch
    ):
        wav_file()

        def boom(*args, **kwargs):
            raise OSError("ffmpeg vanished")

        monkeypatch.setattr(service_main, "decode_to_pcm", boom)
        result = process_job(json.dumps(job()), matcher)
        assert result["error_stage"] == "decode"
        assert result["error"] == "ffmpeg vanished"

    def test_a_matcher_crash_names_the_match_stage(self, job, wav_file, decoded, reported, events):
        class Exploding(StubMatcher):
            def match(self, audio):
                raise RuntimeError("index not loaded")

        wav_file()
        process_job(json.dumps(job()), Exploding())
        [failed] = events("ingest.failed")
        assert failed["stage"] == "match"

    def test_a_path_outside_the_volume_names_the_resolve_stage(self, job, ingest_dir, matcher, reported, events):
        process_job(json.dumps(job(file_path="../escape.wav")), matcher)
        [failed] = events("ingest.failed")
        assert failed["stage"] == "resolve"

    def test_a_crash_outside_any_stage_is_still_reported(self, job, wav_file, matcher, decoded, reported, monkeypatch):
        wav_file()

        def boom(*args, **kwargs):
            raise RuntimeError("level meter broke")

        monkeypatch.setattr(service_main, "level_dbfs", boom)
        result = process_job(json.dumps(job()), matcher)
        assert result["status"] == "failed"
        assert result["error_stage"] == "match"

    def test_no_line_carries_audio_or_the_payload(self, job, wav_file, matcher, reported, events, caplog, monkeypatch):
        wav_file()
        # Recognisable PCM, so any leak of the samples is findable in the text.
        marker = b"AUDIOBYTES" * 2000
        monkeypatch.setattr(
            service_main,
            "decode_to_pcm",
            lambda *a, **k: NormalizedAudio(pcm=marker, sample_rate=22050),
        )
        process_job(json.dumps(job(file_path="chunk.wav")), matcher)

        assert len(events()) == 2
        assert "AUDIOBYTES" not in caplog.text
        assert "chunk.wav" not in caplog.text, "the payload is not logged, even in part"

    def test_no_line_carries_a_credential(self, job, wav_file, matcher, events, caplog, monkeypatch):
        from fingerprint_service import results

        wav_file()
        monkeypatch.setattr(results, "APP_URL", "http://svc:hunter2@app:3000")

        def refuse(url, **kwargs):
            raise results.requests.ConnectionError(f"{url} Authorization: Bearer sk-live-abc123 token=abc123")

        monkeypatch.setattr(results.requests, "post", refuse)
        monkeypatch.setattr(
            service_main,
            "decode_to_pcm",
            lambda *a, **k: NormalizedAudio(pcm=b"\x00\x00" * 100, sample_rate=22050),
        )
        process_job(json.dumps(job()), matcher)

        [failed] = events("ingest.report_failed")
        assert failed["stage"] == "report"
        for secret in ("hunter2", "sk-live-abc123", "abc123"):
            assert secret not in caplog.text


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


class TestHeartbeatWhileBusy:
    """A long job must not read as a dead worker (#282)."""

    def test_beats_while_a_slow_job_runs(self, monkeypatch):
        beats = []
        monkeypatch.setattr(service_main, "write_heartbeat", lambda: beats.append(1))

        with heartbeat_while_busy(interval=0.01):
            time.sleep(0.1)

        assert len(beats) >= 3

    def test_stops_beating_once_the_job_is_done(self, monkeypatch):
        beats = []
        monkeypatch.setattr(service_main, "write_heartbeat", lambda: beats.append(1))

        with heartbeat_while_busy(interval=0.01):
            time.sleep(0.05)
        after = len(beats)
        time.sleep(0.05)

        assert len(beats) == after

    def test_stops_beating_when_the_job_raises(self, monkeypatch):
        beats = []
        monkeypatch.setattr(service_main, "write_heartbeat", lambda: beats.append(1))

        with pytest.raises(RuntimeError), heartbeat_while_busy(interval=0.01):
            raise RuntimeError("decode blew up")
        after = len(beats)
        time.sleep(0.05)

        assert len(beats) == after

    def test_run_once_beats_during_a_long_job(self, fake_redis, matcher, monkeypatch):
        monkeypatch.setattr(service_main, "BRPOP_TIMEOUT", 0.01)
        monkeypatch.setattr(service_main, "HEARTBEAT_INTERVAL", 0.01)
        beats = []
        monkeypatch.setattr(service_main, "write_heartbeat", lambda: beats.append(1))
        monkeypatch.setattr(
            service_main, "process_job", lambda job_json, m: time.sleep(0.1)
        )
        fake_redis.rpush(service_main.QUEUE_KEY, "{}")

        run_once(matcher)

        # One beat from the loop itself, the rest from inside the job.
        assert len(beats) >= 4


class TestSetOnlyWorker:
    """The second worker pops sets and nothing else (#282)."""

    @pytest.fixture(autouse=True)
    def _sets_only(self, monkeypatch):
        monkeypatch.setattr(service_main, "QUEUES", (service_main.SET_QUEUE_KEY,))
        monkeypatch.setattr(service_main, "BRPOP_TIMEOUT", 0.01)

    def test_leaves_live_and_index_jobs_for_the_other_worker(
        self, fake_redis, job, index_job, matcher, reported
    ):
        fake_redis.rpush(service_main.QUEUE_KEY, json.dumps(job()))
        fake_redis.rpush(service_main.INDEX_QUEUE_KEY, json.dumps(index_job()))

        run_once(matcher)

        assert reported == []
        assert fake_redis.llen(service_main.QUEUE_KEY) == 1
        assert fake_redis.llen(service_main.INDEX_QUEUE_KEY) == 1

    def test_takes_a_set_job(self, fake_redis, matcher, set_job, set_dir, set_reported):
        fake_redis.rpush(service_main.SET_QUEUE_KEY, json.dumps(set_job()))

        run_once(matcher)

        assert fake_redis.llen(service_main.SET_QUEUE_KEY) == 0
        assert len(set_reported) == 1

    def test_does_not_advertise_an_engine(self, fake_redis, matcher):
        # The app reads the engine key to decide indexing can run; a worker
        # that never pops the index queue must not vouch for it.
        run_once(matcher)
        assert fake_redis.exists(service_main.ENGINE_KEY) == 0

    def test_still_heartbeats(self, fake_redis, matcher):
        run_once(matcher)
        assert fake_redis.get(service_main.HEARTBEAT_KEY) is not None


class TestPublishEngine:
    """The app reads this to know what `--missing` means (#277)."""

    def test_advertises_the_running_engine(self, fake_redis, matcher):
        publish_engine(matcher)

        stored = fake_redis.hgetall(service_main.ENGINE_KEY)
        assert stored == {"fingerprint_type": "stub", "fingerprint_version": "0"}

    def test_expires_with_the_heartbeat(self, fake_redis, matcher):
        publish_engine(matcher)
        ttl = fake_redis.ttl(service_main.ENGINE_KEY)
        assert 0 < ttl <= service_main.HEARTBEAT_TTL

    def test_a_redis_failure_is_not_fatal(self, fake_redis, matcher, monkeypatch):
        def explode():
            raise ConnectionError("gone")

        monkeypatch.setattr(fake_redis, "pipeline", explode)
        publish_engine(matcher)  # must not raise


@pytest.fixture
def persisted(monkeypatch):
    """Capture fingerprint upserts instead of posting them."""
    sent = []
    monkeypatch.setattr(
        service_main, "try_persist_fingerprint", lambda body: sent.append(body) or True
    )
    return sent


@pytest.fixture
def recorded_stats(monkeypatch):
    """Capture file-stats updates instead of sending them (#303)."""
    sent = []
    monkeypatch.setattr(
        service_main, "try_record_file_stats", lambda body: sent.append(body) or True
    )
    return sent


class TestProcessIndexJobFileStats:
    def test_records_new_stats_for_unchanged_audio(
        self, fake_redis, index_job, audio_dir, matcher, persisted, recorded_stats
    ):
        import hashlib

        (audio_dir / "track.m4a").write_bytes(b"audio")
        stored = hashlib.sha256(b"audio").hexdigest()

        process_index_job(
            json.dumps(index_job(file_path="track.m4a", stored_audio_sha256=stored)), matcher
        )

        assert persisted == []
        assert len(recorded_stats) == 1
        assert recorded_stats[0]["audio_sha256"] == stored
        assert recorded_stats[0]["audio_size_bytes"] == 5
        assert fake_redis.hget(f"fpindex:run:{index_job()['run_id']}", "skipped") == "1"

    def test_sends_nothing_when_the_file_was_not_even_read(
        self, fake_redis, index_job, audio_dir, matcher, persisted, recorded_stats
    ):
        from fingerprint_service.indexer import file_stats

        (audio_dir / "track.m4a").write_bytes(b"audio")
        size, mtime_ms = file_stats(str(audio_dir / "track.m4a"))

        process_index_job(
            json.dumps(
                index_job(
                    file_path="track.m4a",
                    stored_audio_sha256="a" * 64,
                    stored_audio_size_bytes=size,
                    stored_audio_mtime_ms=mtime_ms,
                )
            ),
            matcher,
        )

        assert recorded_stats == []
        assert persisted == []


class TestProcessIndexJob:
    def test_persists_and_counts_an_indexed_track(
        self, fake_redis, index_job, audio_dir, matcher, persisted, monkeypatch
    ):
        (audio_dir / "track.m4a").write_bytes(b"audio")
        monkeypatch.setattr(
            "fingerprint_service.indexer.decode_to_pcm",
            lambda *a, **k: NormalizedAudio(pcm=b"\x00\x00" * 22050, sample_rate=22050),
        )

        process_index_job(json.dumps(index_job(file_path="track.m4a")), matcher)

        assert len(persisted) == 1
        assert persisted[0]["track_id"] == "track-1"
        assert fake_redis.hget(f"fpindex:run:{index_job()['run_id']}", "indexed") == "1"

    def test_counts_a_skip_without_persisting(
        self, fake_redis, index_job, audio_dir, matcher, persisted
    ):
        import hashlib

        (audio_dir / "track.m4a").write_bytes(b"audio")
        stored = hashlib.sha256(b"audio").hexdigest()

        process_index_job(
            json.dumps(index_job(file_path="track.m4a", stored_audio_sha256=stored)),
            matcher,
        )

        assert persisted == []
        assert fake_redis.hget(f"fpindex:run:{index_job()['run_id']}", "skipped") == "1"

    def test_counts_a_missing_file_as_failed(
        self, fake_redis, index_job, audio_dir, matcher, persisted
    ):
        process_index_job(json.dumps(index_job(file_path="gone.m4a")), matcher)

        assert persisted == []
        key = f"fpindex:run:{index_job()['run_id']}"
        assert fake_redis.hget(key, "failed") == "1"
        assert "gone.m4a" in fake_redis.lrange(f"{key}:errors", 0, -1)[0]

    def test_an_escaping_path_is_isolated_to_that_track(
        self, fake_redis, index_job, audio_dir, matcher, persisted
    ):
        process_index_job(json.dumps(index_job(file_path="../../etc/passwd")), matcher)

        assert persisted == []
        assert fake_redis.hget(f"fpindex:run:{index_job()['run_id']}", "failed") == "1"

    def test_an_unexpected_error_is_isolated_to_that_track(
        self, fake_redis, index_job, audio_dir, matcher, persisted, monkeypatch
    ):
        monkeypatch.setattr(
            service_main,
            "index_track",
            lambda *a, **k: (_ for _ in ()).throw(RuntimeError("engine exploded")),
        )

        process_index_job(json.dumps(index_job()), matcher)

        key = f"fpindex:run:{index_job()['run_id']}"
        assert fake_redis.hget(key, "failed") == "1"
        assert "engine exploded" in fake_redis.lrange(f"{key}:errors", 0, -1)[0]

    def test_a_track_that_could_not_be_persisted_is_not_counted_as_indexed(
        self, fake_redis, index_job, audio_dir, matcher, monkeypatch
    ):
        """Generated but not stored is not in the index.

        Counting it as indexed would write a hash the next run skips on, for a
        row that does not exist.
        """
        (audio_dir / "track.m4a").write_bytes(b"audio")
        monkeypatch.setattr(
            "fingerprint_service.indexer.decode_to_pcm",
            lambda *a, **k: NormalizedAudio(pcm=b"\x00\x00" * 22050, sample_rate=22050),
        )
        monkeypatch.setattr(service_main, "try_persist_fingerprint", lambda body: False)

        process_index_job(json.dumps(index_job(file_path="track.m4a")), matcher)

        key = f"fpindex:run:{index_job()['run_id']}"
        assert fake_redis.hget(key, "indexed") is None
        assert fake_redis.hget(key, "failed") == "1"

    def test_defaults_the_engine_identity_to_the_running_matcher(
        self, index_job, audio_dir, matcher, persisted, monkeypatch
    ):
        """A job that names no engine is about whatever this worker is running."""
        (audio_dir / "track.m4a").write_bytes(b"audio")
        monkeypatch.setattr(
            "fingerprint_service.indexer.decode_to_pcm",
            lambda *a, **k: NormalizedAudio(pcm=b"\x00\x00" * 22050, sample_rate=22050),
        )
        payload = index_job(file_path="track.m4a")
        del payload["fingerprint_type"]
        del payload["fingerprint_version"]

        process_index_job(json.dumps(payload), matcher)

        assert persisted[0]["fingerprint_type"] == "stub"
        assert persisted[0]["fingerprint_version"] == "0"

    def test_malformed_json_is_logged_and_dropped(self, fake_redis, matcher, persisted):
        process_index_job("{not json", matcher)
        assert persisted == []
        assert fake_redis.keys("fpindex:*") == []

    def test_a_payload_missing_a_run_cannot_be_counted(
        self, fake_redis, index_job, matcher, persisted
    ):
        # Nothing to count it against, so it is only logged — the same split as
        # a chunk too malformed to name an ingest.
        process_index_job(json.dumps(index_job(run_id=None)), matcher)
        assert persisted == []
        assert fake_redis.keys("fpindex:*") == []


class TestRunOnceDispatch:
    """One blocking pop across both queues, live windows first."""

    def test_handles_an_index_job_from_the_index_queue(
        self, fake_redis, index_job, audio_dir, matcher, persisted, monkeypatch
    ):
        monkeypatch.setattr(service_main, "BRPOP_TIMEOUT", 0.01)
        (audio_dir / "track.m4a").write_bytes(b"audio")
        monkeypatch.setattr(
            "fingerprint_service.indexer.decode_to_pcm",
            lambda *a, **k: NormalizedAudio(pcm=b"\x00\x00" * 22050, sample_rate=22050),
        )
        fake_redis.lpush(
            service_main.INDEX_QUEUE_KEY, json.dumps(index_job(file_path="track.m4a"))
        )

        run_once(matcher)

        assert len(persisted) == 1
        assert fake_redis.llen(service_main.INDEX_QUEUE_KEY) == 0

    def test_a_live_chunk_preempts_a_queued_index_pass(
        self,
        fake_redis,
        job,
        index_job,
        wav_file,
        audio_dir,
        matcher,
        decoded,
        reported,
        persisted,
        monkeypatch,
    ):
        """The reason indexing got its own list.

        A full library pass is thousands of jobs deep; a window captured while
        it runs must not wait behind all of them.
        """
        monkeypatch.setattr(service_main, "BRPOP_TIMEOUT", 0.01)
        wav_file()
        for i in range(5):
            fake_redis.rpush(
                service_main.INDEX_QUEUE_KEY, json.dumps(index_job(track_id=f"t{i}"))
            )
        fake_redis.rpush(service_main.QUEUE_KEY, json.dumps(job()))

        run_once(matcher)

        assert len(reported) == 1, "the live chunk was served first"
        assert persisted == []
        assert fake_redis.llen(service_main.INDEX_QUEUE_KEY) == 5

    def test_falls_back_to_the_index_queue_when_no_chunks_are_waiting(
        self, fake_redis, index_job, audio_dir, matcher, reported, persisted, monkeypatch
    ):
        monkeypatch.setattr(service_main, "BRPOP_TIMEOUT", 0.01)
        fake_redis.rpush(service_main.INDEX_QUEUE_KEY, json.dumps(index_job()))

        run_once(matcher)

        assert reported == []
        assert fake_redis.llen(service_main.INDEX_QUEUE_KEY) == 0

    def test_publishes_the_engine_on_every_pass(self, fake_redis, matcher, monkeypatch):
        monkeypatch.setattr(service_main, "BRPOP_TIMEOUT", 0.01)
        run_once(matcher)
        assert fake_redis.hget(service_main.ENGINE_KEY, "fingerprint_type") == "stub"


class TestRefreshReferenceIndex:
    """Keeping the in-memory index current (#278)."""

    @pytest.fixture(autouse=True)
    def _clock(self):
        reset_index_clock()
        yield
        reset_index_clock()

    def chromaprint(self, tracks=0):
        from fingerprint_service.chromaprint_engine import RawFingerprint
        from fingerprint_service.matcher import ChromaprintMatcher
        from fingerprint_service.reference_index import ReferenceIndex, TrackRef

        matcher = ChromaprintMatcher()
        index = ReferenceIndex()
        for i in range(tracks):
            index.add(TrackRef(f"t{i}", 1), RawFingerprint(tuple(range(i + 1, i + 200))))
        matcher.reference_index = index
        return matcher

    def test_does_nothing_for_the_stub_matcher(self, matcher, monkeypatch):
        called = []
        monkeypatch.setattr(service_main, "try_build_index", lambda *a: called.append(a))
        refresh_reference_index(matcher)
        assert called == []

    def test_loads_an_index_on_the_first_pass(self, monkeypatch):
        from fingerprint_service.chromaprint_engine import RawFingerprint
        from fingerprint_service.reference_index import ReferenceIndex, TrackRef

        fresh = ReferenceIndex()
        fresh.add(TrackRef("t1", 1), RawFingerprint(tuple(range(1, 200))))
        monkeypatch.setattr(service_main, "try_build_index", lambda *a: fresh)

        matcher = self.chromaprint()
        refresh_reference_index(matcher, now=1000.0)

        assert matcher.reference_index is fresh

    def test_does_not_refetch_before_the_interval(self, monkeypatch):
        calls = []
        monkeypatch.setattr(
            service_main,
            "try_build_index",
            lambda *a: calls.append(a) or ReferenceIndex(),
        )
        matcher = self.chromaprint()

        refresh_reference_index(matcher, now=1000.0)
        refresh_reference_index(matcher, now=1000.0 + service_main.INDEX_REFRESH_SECONDS - 1)

        assert len(calls) == 1

    def test_refetches_once_the_interval_has_passed(self, monkeypatch):
        calls = []
        monkeypatch.setattr(
            service_main,
            "try_build_index",
            lambda *a: calls.append(a) or ReferenceIndex(),
        )
        matcher = self.chromaprint()

        refresh_reference_index(matcher, now=1000.0)
        refresh_reference_index(matcher, now=1000.0 + service_main.INDEX_REFRESH_SECONDS + 1)

        assert len(calls) == 2

    def test_retries_a_failed_load_soon_not_after_a_whole_interval(self, monkeypatch):
        """#315: a worker that boots before the app must not wait 15 minutes."""
        calls = []
        monkeypatch.setattr(
            service_main, "try_build_index", lambda *a: calls.append(a) or None
        )
        matcher = self.chromaprint()

        refresh_reference_index(matcher, now=1000.0)
        refresh_reference_index(matcher, now=1000.0 + service_main.INDEX_RETRY_SECONDS - 1)
        assert len(calls) == 1, "not before the retry delay"

        refresh_reference_index(matcher, now=1000.0 + service_main.INDEX_RETRY_SECONDS)
        assert len(calls) == 2

    def test_a_success_after_a_failure_waits_the_full_interval(self, monkeypatch):
        outcomes = iter([None, ReferenceIndex()])
        calls = []
        monkeypatch.setattr(
            service_main,
            "try_build_index",
            lambda *a: calls.append(a) or next(outcomes),
        )
        matcher = self.chromaprint()
        retry_at = 1000.0 + service_main.INDEX_RETRY_SECONDS

        refresh_reference_index(matcher, now=1000.0)
        refresh_reference_index(matcher, now=retry_at)
        refresh_reference_index(
            matcher, now=retry_at + service_main.INDEX_REFRESH_SECONDS - 1
        )

        assert len(calls) == 2

    def test_an_exception_waits_out_the_retry_delay(self, monkeypatch):
        calls = []

        def explode(*a):
            calls.append(a)
            raise RuntimeError("unexpected")

        monkeypatch.setattr(service_main, "try_build_index", explode)
        matcher = self.chromaprint()

        with pytest.raises(RuntimeError):
            refresh_reference_index(matcher, now=1000.0)
        refresh_reference_index(matcher, now=1001.0)

        assert len(calls) == 1

    def test_keeps_the_current_index_when_the_app_is_down(self, monkeypatch):
        monkeypatch.setattr(service_main, "try_build_index", lambda *a: None)
        matcher = self.chromaprint(tracks=3)
        before = matcher.reference_index

        refresh_reference_index(matcher, now=1000.0)

        assert matcher.reference_index is before
        assert len(matcher.reference_index) == 3

    def test_refuses_to_replace_a_populated_index_with_an_empty_one(self, monkeypatch):
        """An empty response is far likelier to be a bad answer than a deletion."""
        from fingerprint_service.reference_index import ReferenceIndex

        monkeypatch.setattr(service_main, "try_build_index", lambda *a: ReferenceIndex())
        matcher = self.chromaprint(tracks=3)

        refresh_reference_index(matcher, now=1000.0)

        assert len(matcher.reference_index) == 3

    def test_accepts_an_empty_index_when_it_had_none(self, monkeypatch):
        # Before library indexing has ever run, empty is the truth (#277).
        from fingerprint_service.reference_index import ReferenceIndex

        empty = ReferenceIndex()
        monkeypatch.setattr(service_main, "try_build_index", lambda *a: empty)
        matcher = self.chromaprint()

        refresh_reference_index(matcher, now=1000.0)

        assert matcher.reference_index is empty


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


@pytest.fixture
def set_reported(monkeypatch):
    """Capture set results and claims instead of posting them."""
    sent = []
    monkeypatch.setattr(
        service_main, "try_report_set_result", lambda result: sent.append(result) or True
    )
    monkeypatch.setattr(service_main, "try_claim_set", lambda derivation_id: True)
    return sent


class TestProcessSetJob:
    """A set payload end to end (#282)."""

    def test_reports_the_derivation(self, set_job, set_dir, matcher, set_reported, monkeypatch):
        monkeypatch.setattr(
            "fingerprint_service.sets.stream_pcm",
            lambda *a, **k: iter([b"\x00\x00" * 22050 * 20]),
        )

        result = service_main.process_set_job(json.dumps(set_job()), matcher)

        assert result["status"] == "processed"
        assert len(result["windows"]) == 2
        assert set_reported == [result]

    def test_claims_before_the_work(self, set_job, set_dir, matcher, set_reported, monkeypatch):
        order = []
        monkeypatch.setattr(service_main, "try_claim_set", lambda d: order.append("claim"))
        monkeypatch.setattr(service_main, "derive", lambda job, m: order.append("derive") or {"derivation_id": "d"})

        service_main.process_set_job(json.dumps(set_job()), matcher)

        assert order == ["claim", "derive"]

    def test_bad_json_is_logged_not_reported(self, matcher, set_reported, caplog):
        assert service_main.process_set_job("{not json", matcher) is None
        assert set_reported == []
        assert "Failed to parse set job JSON" in caplog.text

    def test_a_payload_naming_no_derivation_is_logged_not_reported(self, matcher, set_reported):
        assert service_main.process_set_job(json.dumps({"file_path": "x"}), matcher) is None
        assert set_reported == []

    def test_a_path_outside_the_volume_is_a_reported_rejection(self, set_job, set_dir, matcher, set_reported):
        result = service_main.process_set_job(json.dumps(set_job(file_path="../../etc/passwd")), matcher)

        assert result["status"] == "failed"
        assert "outside" in result["error"]
        assert set_reported == [result]

    def test_bad_window_settings_are_a_reported_rejection(self, set_job, set_dir, matcher, set_reported):
        result = service_main.process_set_job(json.dumps(set_job(step_seconds=0)), matcher)

        assert result["status"] == "failed"
        assert (result["window_seconds"], result["step_seconds"]) == (0.0, 0.0)

    def test_a_crash_is_a_reported_failure(self, set_job, set_dir, matcher, set_reported, monkeypatch):
        def explode(job, m):
            raise RuntimeError("index exploded")

        monkeypatch.setattr(service_main, "derive", explode)

        result = service_main.process_set_job(json.dumps(set_job()), matcher)

        assert result["status"] == "failed"
        assert result["error"] == "index exploded"
        assert (result["window_seconds"], result["step_seconds"]) == (15.0, 15.0)
