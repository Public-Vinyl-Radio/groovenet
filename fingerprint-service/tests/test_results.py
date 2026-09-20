import pytest
import requests
from fingerprint_service import results
from fingerprint_service.matcher import StubMatcher
from fingerprint_service.results import (
    ResultReportError,
    build_result,
    report_result,
    result_url,
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
