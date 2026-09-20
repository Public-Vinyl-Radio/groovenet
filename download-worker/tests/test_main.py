import json

import pytest
import redis

from worker import main as worker_main


@pytest.fixture
def handlers(monkeypatch):
    """Replace every job handler with a recorder so dispatch is observable."""
    calls = []

    def make(name):
        def handler(job):
            calls.append((name, job))
            return {"status": name}
        return handler

    names = [
        "fix_duration",
        "analyze_local_audio",
        "extract_embedded_cover_art",
        "extract_embedded_cover_art_album",
        "download_audio",
    ]
    fakes = {name: make(name) for name in names}
    for name, fake in fakes.items():
        monkeypatch.setattr(worker_main, name, fake)

    # The dispatch table captured the real functions at import time, so rebuild
    # it against the fakes.
    monkeypatch.setattr(
        worker_main,
        "JOB_HANDLERS",
        {
            "fix-duration": fakes["fix_duration"],
            "fix_duration": fakes["fix_duration"],
            "analyze-local": fakes["analyze_local_audio"],
            "analyze_local": fakes["analyze_local_audio"],
            "extract-cover-art-album": fakes["extract_embedded_cover_art_album"],
            "extract_cover_art_album": fakes["extract_embedded_cover_art_album"],
            "extract-cover-art": fakes["extract_embedded_cover_art"],
            "extract_cover_art": fakes["extract_embedded_cover_art"],
        },
    )
    return calls


def job(**overrides):
    base = {"track_id": "t1", "friend_id": 1, "job_id": "j1"}
    base.update(overrides)
    return base


class TestNormalizeJobType:
    def test_defaults_to_download(self):
        assert worker_main.normalize_job_type(job()) == "download"

    @pytest.mark.parametrize(
        "raw", ["FIX-DURATION", "  fix-duration  ", "Fix-Duration"]
    )
    def test_trims_and_lowercases(self, raw):
        assert worker_main.normalize_job_type(job(job_type=raw)) == "fix-duration"

    def test_coerces_a_non_string(self):
        assert worker_main.normalize_job_type(job(job_type=7)) == "7"


class TestSelectHandler:
    @pytest.mark.parametrize(
        "job_type,expected",
        [
            ("fix-duration", "fix_duration"),
            ("fix_duration", "fix_duration"),
            ("analyze-local", "analyze_local_audio"),
            ("analyze_local", "analyze_local_audio"),
            ("extract-cover-art", "extract_embedded_cover_art"),
            ("extract_cover_art", "extract_embedded_cover_art"),
            ("extract-cover-art-album", "extract_embedded_cover_art_album"),
            ("extract_cover_art_album", "extract_embedded_cover_art_album"),
        ],
    )
    def test_routes_each_explicit_job_type(self, handlers, job_type, expected):
        handler = worker_main.select_handler(job(job_type=job_type))
        handler(job())
        assert handlers[0][0] == expected

    def test_album_cover_art_is_not_shadowed_by_the_track_variant(self, handlers):
        """The two keys share a prefix; routing must match the whole string."""
        worker_main.select_handler(job(job_type="extract-cover-art-album"))(job())
        assert handlers[0][0] == "extract_embedded_cover_art_album"

    def test_defaults_to_download(self, handlers):
        worker_main.select_handler(job())(job())
        assert handlers[0][0] == "download_audio"

    def test_unknown_job_type_falls_through_to_download(self, handlers):
        worker_main.select_handler(job(job_type="not-a-real-type"))(job())
        assert handlers[0][0] == "download_audio"

    def test_local_audio_without_remote_urls_is_analyzed_in_place(
        self, handlers, monkeypatch
    ):
        monkeypatch.setattr(worker_main, "has_download_urls", lambda j: False)

        worker_main.select_handler(job(local_audio_url="/audio/t1.flac"))(job())

        assert handlers[0][0] == "analyze_local_audio"

    def test_local_audio_with_remote_urls_still_downloads(self, handlers, monkeypatch):
        monkeypatch.setattr(worker_main, "has_download_urls", lambda j: True)

        worker_main.select_handler(
            job(local_audio_url="/audio/t1.flac", youtube_url="https://y.test/x")
        )(job())

        assert handlers[0][0] == "download_audio"

    def test_explicit_job_type_wins_over_local_audio(self, handlers, monkeypatch):
        monkeypatch.setattr(worker_main, "has_download_urls", lambda j: False)

        worker_main.select_handler(
            job(job_type="fix-duration", local_audio_url="/audio/t1.flac")
        )(job())

        assert handlers[0][0] == "fix_duration"

    def test_no_local_audio_url_goes_to_download(self, handlers, monkeypatch):
        monkeypatch.setattr(worker_main, "has_download_urls", lambda j: False)

        worker_main.select_handler(job())(job())

        assert handlers[0][0] == "download_audio"


class TestVerifyRedis:
    def test_returns_true_when_redis_answers(self, fake_redis):
        assert worker_main.verify_redis() is True

    def test_reports_the_queue_length(self, fake_redis):
        fake_redis.lpush(worker_main.QUEUE_KEY, "a", "b")

        assert worker_main.verify_redis() is True

    def test_returns_false_when_ping_fails(self, monkeypatch):
        class Dead:
            def ping(self):
                raise redis.ConnectionError("refused")

        monkeypatch.setattr(worker_main, "redis_conn", Dead())

        assert worker_main.verify_redis() is False

    def test_returns_false_when_the_queue_probe_fails(self, monkeypatch):
        class HalfDead:
            def ping(self):
                return True

            def llen(self, key):
                raise redis.ConnectionError("gone mid-check")

        monkeypatch.setattr(worker_main, "redis_conn", HalfDead())

        assert worker_main.verify_redis() is False


class TestWriteHeartbeat:
    def test_writes_the_heartbeat_key_with_a_ttl(self, fake_redis):
        worker_main.write_heartbeat()

        assert fake_redis.get(worker_main.HEARTBEAT_KEY) is not None
        assert fake_redis.ttl(worker_main.HEARTBEAT_KEY) > 0

    def test_swallows_a_redis_failure(self, monkeypatch):
        class Dead:
            def set(self, *a, **kw):
                raise redis.ConnectionError("refused")

        monkeypatch.setattr(worker_main, "redis_conn", Dead())

        # Must not raise: a missed heartbeat is not worth killing the worker.
        worker_main.write_heartbeat()


class TestProcessJob:
    def test_runs_the_selected_handler_and_returns_its_result(self, handlers):
        result = worker_main.process_job(json.dumps(job(job_type="fix-duration")))

        assert result == {"status": "fix_duration"}
        assert handlers[0][0] == "fix_duration"

    def test_passes_the_parsed_job_to_the_handler(self, handlers):
        worker_main.process_job(json.dumps(job(job_type="fix-duration", extra="x")))

        _, received = handlers[0]
        assert received["track_id"] == "t1"
        assert received["extra"] == "x"

    def test_returns_none_on_malformed_json(self, handlers):
        assert worker_main.process_job("{not json") is None
        assert handlers == []

    def test_returns_none_when_the_handler_raises(self, monkeypatch):
        def boom(job):
            raise RuntimeError("handler exploded")

        monkeypatch.setattr(worker_main, "select_handler", lambda j: boom)

        assert worker_main.process_job(json.dumps(job())) is None

    def test_a_failing_handler_does_not_propagate(self, monkeypatch):
        """One bad job must not be able to stop the worker."""
        monkeypatch.setattr(
            worker_main,
            "select_handler",
            lambda j: (_ for _ in ()).throw(ValueError("selection failed")),
        )

        assert worker_main.process_job(json.dumps(job())) is None


class TestRunOnce:
    @pytest.fixture(autouse=True)
    def fast_brpop(self, monkeypatch):
        """Don't spend the real 5s brpop timeout when the queue is empty."""
        monkeypatch.setattr(worker_main, "BRPOP_TIMEOUT", 1)

    def test_refreshes_the_heartbeat_even_with_an_empty_queue(self, fake_redis):
        worker_main.run_once()

        assert fake_redis.get(worker_main.HEARTBEAT_KEY) is not None

    def test_does_nothing_more_when_the_queue_is_empty(self, handlers, fake_redis):
        worker_main.run_once()

        assert handlers == []

    def test_pops_and_processes_a_queued_job(self, handlers, fake_redis):
        fake_redis.lpush(worker_main.QUEUE_KEY, json.dumps(job(job_type="fix-duration")))

        worker_main.run_once()

        assert handlers[0][0] == "fix_duration"

    def test_consumes_the_job_from_the_queue(self, handlers, fake_redis):
        fake_redis.lpush(worker_main.QUEUE_KEY, json.dumps(job(job_type="fix-duration")))

        worker_main.run_once()

        assert fake_redis.llen(worker_main.QUEUE_KEY) == 0

    def test_takes_the_oldest_job_first(self, handlers, fake_redis):
        fake_redis.lpush(worker_main.QUEUE_KEY, json.dumps(job(job_id="old")))
        fake_redis.lpush(worker_main.QUEUE_KEY, json.dumps(job(job_id="new")))

        worker_main.run_once()

        assert handlers[0][1]["job_id"] == "old"


class TestMain:
    def test_returns_without_looping_when_redis_is_unreachable(self, monkeypatch):
        monkeypatch.setattr(worker_main, "verify_redis", lambda: False)
        ran = []
        monkeypatch.setattr(worker_main, "run_once", lambda: ran.append(1))

        worker_main.main()

        assert ran == []

    def test_loops_until_interrupted(self, monkeypatch):
        monkeypatch.setattr(worker_main, "verify_redis", lambda: True)
        calls = []

        def run_once():
            calls.append(1)
            if len(calls) == 3:
                raise KeyboardInterrupt

        monkeypatch.setattr(worker_main, "run_once", run_once)

        worker_main.main()

        assert len(calls) == 3

    def test_backs_off_and_continues_after_a_connection_error(self, monkeypatch):
        monkeypatch.setattr(worker_main, "verify_redis", lambda: True)
        sleeps = []
        monkeypatch.setattr(worker_main.time, "sleep", lambda s: sleeps.append(s))
        calls = []

        def run_once():
            calls.append(1)
            if len(calls) == 1:
                raise redis.ConnectionError("dropped")
            raise KeyboardInterrupt

        monkeypatch.setattr(worker_main, "run_once", run_once)

        worker_main.main()

        assert sleeps == [5]
        assert len(calls) == 2

    def test_backs_off_and_continues_after_an_unexpected_error(self, monkeypatch):
        monkeypatch.setattr(worker_main, "verify_redis", lambda: True)
        sleeps = []
        monkeypatch.setattr(worker_main.time, "sleep", lambda s: sleeps.append(s))
        calls = []

        def run_once():
            calls.append(1)
            if len(calls) == 1:
                raise RuntimeError("something odd")
            raise KeyboardInterrupt

        monkeypatch.setattr(worker_main, "run_once", run_once)

        worker_main.main()

        assert sleeps == [1]
        assert len(calls) == 2
