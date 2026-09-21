"""Loading the reference index over REST (#278).

This service holds no database connection by design (#273), so the stored
blobs arrive over HTTP and are rebuilt into an index here.
"""
import base64

import pytest
import requests
from fingerprint_service import reference_loader
from fingerprint_service.chromaprint_engine import RawFingerprint
from fingerprint_service.reference_loader import (
    ReferenceLoadError,
    build_index,
    fetch_page,
    fingerprints_url,
    try_build_index,
)


class FakeResponse:
    def __init__(self, payload=None, status_code=200, text=""):
        self._payload = payload if payload is not None else {"fingerprints": []}
        self.status_code = status_code
        self.text = text

    @property
    def ok(self):
        return self.status_code < 400

    def json(self):
        return self._payload


def row(track_id="t1", friend_id=1, values=(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)):
    return {
        "track_id": track_id,
        "friend_id": friend_id,
        "fingerprint_type": "chromaprint",
        "fingerprint_version": "1.6.1",
        "fingerprint_data": base64.b64encode(RawFingerprint(values).to_bytes()).decode(),
        "audio_sha256": "a" * 64,
        "audio_duration_seconds": 200.0,
    }


@pytest.fixture
def fetched(monkeypatch):
    """Serve canned pages, recording the requests made."""
    calls = []
    pages = []

    def fake_get(url, params=None, timeout=None):
        calls.append({"url": url, "params": params})
        return FakeResponse(
            {"fingerprints": pages[len(calls) - 1] if len(calls) <= len(pages) else []}
        )

    monkeypatch.setattr(reference_loader.requests, "get", fake_get)
    return calls, pages


class TestFingerprintsUrl:
    def test_builds_the_collection_url(self, monkeypatch):
        monkeypatch.setattr(reference_loader, "APP_URL", "http://app:3000")
        assert fingerprints_url() == "http://app:3000/api/fingerprints"

    def test_tolerates_a_trailing_slash(self, monkeypatch):
        monkeypatch.setattr(reference_loader, "APP_URL", "http://app:3000/")
        assert fingerprints_url() == "http://app:3000/api/fingerprints"


class TestFetchPage:
    def test_asks_for_one_engine_and_version(self, fetched):
        calls, pages = fetched
        pages.append([row()])

        fetch_page("chromaprint", "1.6.1", limit=500, offset=0)

        assert calls[0]["params"] == {
            "fingerprint_type": "chromaprint",
            "fingerprint_version": "1.6.1",
            "limit": 500,
            "offset": 0,
        }

    def test_accepts_a_bare_list(self, monkeypatch):
        monkeypatch.setattr(
            reference_loader.requests, "get", lambda *a, **k: FakeResponse([row()])
        )
        assert len(fetch_page("chromaprint", "1", limit=10, offset=0)) == 1

    def test_raises_when_the_app_refuses(self, monkeypatch):
        monkeypatch.setattr(
            reference_loader.requests,
            "get",
            lambda *a, **k: FakeResponse(status_code=500, text="boom"),
        )
        with pytest.raises(ReferenceLoadError, match="500"):
            fetch_page("chromaprint", "1", limit=10, offset=0)

    def test_raises_when_the_app_is_unreachable(self, monkeypatch):
        def refuse(*a, **k):
            raise requests.ConnectionError("connection refused")

        monkeypatch.setattr(reference_loader.requests, "get", refuse)
        with pytest.raises(ReferenceLoadError, match="Could not reach"):
            fetch_page("chromaprint", "1", limit=10, offset=0)

    def test_rejects_a_payload_that_is_not_a_list(self, monkeypatch):
        monkeypatch.setattr(
            reference_loader.requests,
            "get",
            lambda *a, **k: FakeResponse({"fingerprints": {"nope": True}}),
        )
        with pytest.raises(ReferenceLoadError, match="expected a list"):
            fetch_page("chromaprint", "1", limit=10, offset=0)


class TestBuildIndex:
    def test_indexes_every_row(self, fetched):
        _, pages = fetched
        pages.append([row("t1", 1), row("t2", 2)])

        index = build_index("chromaprint", "1.6.1", page_size=500)

        assert len(index) == 2

    def test_pages_until_a_short_page(self, fetched):
        calls, pages = fetched
        pages.append([row(f"t{i}") for i in range(2)])
        pages.append([row("t9")])

        index = build_index("chromaprint", "1.6.1", page_size=2)

        assert len(index) == 3
        assert [c["params"]["offset"] for c in calls] == [0, 2]

    def test_stops_on_an_empty_first_page(self, fetched):
        calls, _ = fetched
        index = build_index("chromaprint", "1.6.1", page_size=500)
        assert len(index) == 0
        assert len(calls) == 1

    def test_skips_a_null_blob_without_failing(self, fetched):
        # The stub engine stores null by design, so this is a real case.
        _, pages = fetched
        bad = row("t2", 2)
        bad["fingerprint_data"] = None
        pages.append([row("t1", 1), bad])

        assert len(build_index("chromaprint", "1.6.1", page_size=500)) == 1

    def test_skips_a_malformed_blob_without_failing(self, fetched):
        # One bad row should cost that track, not the whole index.
        _, pages = fetched
        bad = row("t2", 2)
        bad["fingerprint_data"] = base64.b64encode(b"\x01\x02\x03").decode()
        pages.append([row("t1", 1), bad])

        assert len(build_index("chromaprint", "1.6.1", page_size=500)) == 1

    def test_the_rebuilt_index_is_searchable(self, fetched, tone_pcm):
        from fingerprint_service.chromaprint_engine import fingerprint_pcm

        real = fingerprint_pcm(tone_pcm(60.0, seed=1.0), 22050)
        _, pages = fetched
        pages.append([row("t1", 1, values=real.values)])

        index = build_index("chromaprint", "1.6.1", page_size=500)
        hits = index.search(
            RawFingerprint(real.values[200:330]), max_bit_error_rate=0.25
        )

        assert hits[0].track.track_id == "t1"


class TestTryBuildIndex:
    def test_returns_the_index_on_success(self, fetched):
        _, pages = fetched
        pages.append([row()])
        assert try_build_index("chromaprint", "1.6.1") is not None

    def test_returns_none_rather_than_raising(self, monkeypatch):
        """A matcher keeps whatever index it has.

        Serving slightly stale matches beats refusing to match at all while the
        app restarts.
        """
        def refuse(*a, **k):
            raise requests.ConnectionError("app is down")

        monkeypatch.setattr(reference_loader.requests, "get", refuse)
        assert try_build_index("chromaprint", "1.6.1") is None
