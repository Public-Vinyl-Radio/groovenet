import pytest
import requests
from fingerprint_service import results
from fingerprint_service.matcher import StubMatcher
from fingerprint_service.results import (
    ResultReportError,
    build_result,
    claim_url,
    fingerprint_url,
    persist_fingerprint,
    report_result,
    result_url,
    try_claim_ingest,
    try_persist_fingerprint,
    try_report_result,
)


class FakeResponse:
    def __init__(self, status_code=202, text=""):
        self.status_code = status_code
        self.text = text

    @property
    def ok(self):
        return self.status_code < 400


@pytest.fixture
def posted(monkeypatch):
    """Record every POST instead of making one."""
    calls = []

    def fake_post(url, json=None, timeout=None):
        calls.append({"url": url, "json": json, "timeout": timeout})
        return calls[-1].get("response") or FakeResponse()

    monkeypatch.setattr(results.requests, "post", fake_post)
    return calls


@pytest.fixture
def matcher():
    return StubMatcher()


class TestResultUrl:
    def test_addresses_the_ingest_callback(self, monkeypatch):
        monkeypatch.setattr(results, "APP_URL", "http://app:3000")
        assert result_url("abc") == "http://app:3000/api/audio/ingest/abc/result"

    def test_tolerates_a_trailing_slash_on_app_url(self, monkeypatch):
        monkeypatch.setattr(results, "APP_URL", "http://app:3000/")
        assert result_url("abc") == "http://app:3000/api/audio/ingest/abc/result"


class TestBuildResult:
    def test_carries_the_ingest_identity_through(self, job, matcher):
        result = build_result(job(), matcher)
        assert result["ingest_id"] == "11111111-1111-1111-1111-111111111111"
        assert result["source_id"] == "living-room-vinyl"
        assert result["session_id"] == "session-1"
        assert result["sequence"] == 7

    def test_window_starts_when_the_listener_captured_it(self, job, matcher):
        result = build_result(job(captured_at="2026-09-20T18:42:10Z"), matcher)
        assert result["window_start_at"] == "2026-09-20T18:42:10Z"

    def test_records_the_engine_that_produced_the_answer(self, job, matcher):
        result = build_result(job(), matcher)
        assert result["fingerprint_type"] == "stub"
        assert result["fingerprint_version"] == "0"

    def test_a_no_match_window_is_processed_not_failed(self, job, matcher):
        result = build_result(job(), matcher, candidates=[], duration_seconds=15.0)
        assert result["status"] == "processed"
        assert result["error"] is None
        assert result["candidates"] == []

    def test_an_error_makes_it_failed(self, job, matcher):
        result = build_result(job(), matcher, error="truncated upload")
        assert result["status"] == "failed"
        assert result["error"] == "truncated upload"

    def test_reports_what_was_actually_decoded(self, job, matcher):
        result = build_result(job(), matcher, duration_seconds=14.98, sample_rate=22050)
        assert result["duration_seconds"] == 14.98
        assert result["sample_rate"] == 22050

    def test_optional_job_fields_come_back_as_null(self, job, matcher):
        result = build_result(
            {"ingest_id": "i1", "source_id": "s1", "file_path": "c.wav"}, matcher
        )
        assert result["session_id"] is None
        assert result["sequence"] is None
        assert result["window_start_at"] is None


class TestReportResult:
    def test_posts_the_body_to_the_callback(self, job, matcher, posted):
        result = build_result(job(), matcher)
        report_result(result)
        assert len(posted) == 1
        assert posted[0]["url"].endswith("/api/audio/ingest/11111111-1111-1111-1111-111111111111/result")
        assert posted[0]["json"] == result

    def test_raises_when_the_app_rejects_it(self, job, matcher, monkeypatch):
        monkeypatch.setattr(
            results.requests, "post", lambda *a, **k: FakeResponse(500, "boom")
        )
        with pytest.raises(ResultReportError, match="returned 500"):
            report_result(build_result(job(), matcher))

    def test_raises_when_the_app_is_unreachable(self, job, matcher, monkeypatch):
        def boom(*args, **kwargs):
            raise requests.ConnectionError("no route to host")

        monkeypatch.setattr(results.requests, "post", boom)
        with pytest.raises(ResultReportError, match="Could not reach"):
            report_result(build_result(job(), matcher))


class TestTryReportResult:
    def test_returns_true_when_accepted(self, job, matcher, posted):
        assert try_report_result(build_result(job(), matcher)) is True

    def test_logs_rather_than_raising_when_the_app_is_down(
        self, job, matcher, monkeypatch, caplog
    ):
        def boom(*args, **kwargs):
            raise requests.ConnectionError("no route to host")

        monkeypatch.setattr(results.requests, "post", boom)
        assert try_report_result(build_result(job(), matcher)) is False
        assert "Failed to report ingest" in caplog.text


@pytest.fixture
def upsert():
    return {
        "track_id": "track-1",
        "friend_id": 1,
        "fingerprint_type": "stub",
        "fingerprint_version": "0",
        "fingerprint_data": None,
        "audio_sha256": "abc",
        "audio_duration_seconds": 212.5,
    }


class TestFingerprintUrl:
    def test_builds_the_collection_url(self, monkeypatch):
        monkeypatch.setattr(results, "APP_URL", "http://app:3000")
        assert fingerprint_url() == "http://app:3000/api/fingerprints"

    def test_tolerates_a_trailing_slash(self, monkeypatch):
        monkeypatch.setattr(results, "APP_URL", "http://app:3000/")
        assert fingerprint_url() == "http://app:3000/api/fingerprints"


class TestPersistFingerprint:
    def test_posts_the_upsert_body(self, posted, upsert):
        persist_fingerprint(upsert)

        assert len(posted) == 1
        assert posted[0]["url"].endswith("/api/fingerprints")
        assert posted[0]["json"] == upsert

    def test_raises_when_the_app_refuses(self, monkeypatch, upsert):
        monkeypatch.setattr(
            results.requests, "post", lambda *a, **k: FakeResponse(422, "bad friend_id")
        )
        with pytest.raises(ResultReportError, match="422"):
            persist_fingerprint(upsert)

    def test_raises_when_the_app_is_unreachable(self, monkeypatch, upsert):
        def refuse(*args, **kwargs):
            raise requests.ConnectionError("connection refused")

        monkeypatch.setattr(results.requests, "post", refuse)
        with pytest.raises(ResultReportError, match="Could not reach"):
            persist_fingerprint(upsert)


class TestTryPersistFingerprint:
    def test_returns_true_on_success(self, posted, upsert):
        assert try_persist_fingerprint(upsert) is True

    def test_returns_false_rather_than_raising(self, monkeypatch, upsert):
        """A track that could not be stored is a failed track, not a dead run.

        The next run regenerates it anyway: with no row, there is no stored hash
        to skip on.
        """
        monkeypatch.setattr(
            results.requests, "post", lambda *a, **k: FakeResponse(500, "boom")
        )
        assert try_persist_fingerprint(upsert) is False


class TestClaimIngest:
    """Announcing a pickup (#276)."""

    def test_builds_the_claim_url(self, monkeypatch):
        monkeypatch.setattr(results, "APP_URL", "http://app:3000")
        assert claim_url("abc") == "http://app:3000/api/audio/ingest/abc/claim"

    def test_posts_to_the_claim_route(self, monkeypatch):
        calls = []

        def fake_post(url, timeout=None):
            calls.append(url)
            return FakeResponse(200)

        monkeypatch.setattr(results.requests, "post", fake_post)

        assert try_claim_ingest("abc") is True
        assert calls == ["http://app:3000/api/audio/ingest/abc/claim"]

    def test_a_refused_claim_is_not_fatal(self, monkeypatch):
        # A 404 means the app does not know this ingest. Worth a warning, not
        # worth refusing to process audio we are already holding.
        monkeypatch.setattr(
            results.requests, "post", lambda *a, **k: FakeResponse(404, "gone")
        )
        assert try_claim_ingest("abc") is False

    def test_an_unreachable_app_is_not_fatal(self, monkeypatch):
        def refuse(*args, **kwargs):
            raise requests.ConnectionError("connection refused")

        monkeypatch.setattr(results.requests, "post", refuse)
        assert try_claim_ingest("abc") is False
