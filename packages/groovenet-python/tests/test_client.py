"""Request examples double as the path/verb inventory for the OpenAPI check."""

import io
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from unittest.mock import Mock

import pytest
import requests
from groovenet_client import GroovenetApiError, GroovenetClient

TRACK = {
    "track_id": "t1",
    "friend_id": 7,
    "local_audio_url": "song.m4a",
    "audio_source": "apple_music",
    "duration_seconds": 0,
    "bpm": 124,
    "key": "C major",
    "danceability": 0.0,
    "mood_happy": 0.123,
    "mood_sad": 0.234,
    "mood_relaxed": 0.345,
    "mood_aggressive": 0.456,
    "year": "1999",
    "audio_file_album_art_url": "/uploads/cover.jpg",
}
CANDIDATE = {"track_id": "t1", "friend_id": 7, "confidence": 0.9, "offset_seconds": 15.0}
INGEST = {
    "ingest_id": "i1",
    "source_id": "vinyl",
    "session_id": None,
    "sequence": 0,
    "status": "processed",
    "error": None,
    "error_stage": None,
    "window_start_at": None,
    "duration_seconds": 15.0,
    "sample_rate": 22050,
    "level_dbfs": -25.0,
    "fingerprint_type": "chromaprint",
    "fingerprint_version": "1",
    "candidates": [CANDIDATE],
}
SET = {
    "derivation_id": "d1",
    "status": "processed",
    "error": None,
    "fingerprint_type": "chromaprint",
    "fingerprint_version": "1",
    "sample_rate": 22050,
    "duration_seconds": 30.0,
    "window_seconds": 15.0,
    "step_seconds": 15.0,
    "windows": [{"start_seconds": 0.0, "duration_seconds": 15.0, "candidates": [CANDIDATE]}],
}
STATS = {
    "track_id": "t1",
    "friend_id": 7,
    "fingerprint_type": "chromaprint",
    "fingerprint_version": "1",
    "audio_sha256": "a" * 64,
    "audio_size_bytes": 123456,
    "audio_mtime_ms": 1790000000000,
}
UPSERT = {**STATS, "fingerprint_data": None, "audio_duration_seconds": 212.5}
COVER = {
    "release_id": "r1",
    "friend_id": 7,
    "status": "matched",
    "distance": 4,
    "applied": True,
    "apple_music_art_url": "https://art.test/cover.jpg",
}
PAGE = {
    "fingerprints": [
        {
            "track_id": "t1",
            "friend_id": 7,
            "fingerprint_type": "chromaprint",
            "fingerprint_version": "1",
            "fingerprint_data": "AAAAAA==",
            "audio_sha256": "a" * 64,
            "audio_duration_seconds": 212.5,
        }
    ],
    "limit": 500,
    "offset": 1000,
}


@dataclass
class RequestCase:
    name: str
    args: tuple
    method: str
    path: str
    kwargs: dict[str, Any]
    result: Any = None


CASES = [
    RequestCase("update_track", (TRACK,), "PATCH", "/api/tracks", {"json": TRACK}),
    RequestCase("report_job_outcome", ("job /?#é",), "POST", "/api/jobs/job%20%2F%3F%23%C3%A9/outcome", {}),
    RequestCase(
        "extract_cover_art",
        ("rel/99", 7),
        "POST",
        "/api/albums/rel%2F99/artwork/match",
        {"params": {"friend_id": 7}},
        COVER,
    ),
    RequestCase(
        "fetch_audio", ("song ?#.m4a",), "GET", "/api/audio", {"params": {"filename": "song ?#.m4a"}, "stream": True}
    ),
    RequestCase("claim_ingest", ("i/1",), "POST", "/api/audio/ingest/i%2F1/claim", {}),
    RequestCase("report_ingest_result", ("i/1", INGEST), "POST", "/api/audio/ingest/i%2F1/result", {"json": INGEST}),
    RequestCase("claim_set_derivation", ("d/1",), "POST", "/api/set-derivations/d%2F1/claim", {}),
    RequestCase("report_set_result", ("d/1", SET), "POST", "/api/set-derivations/d%2F1/result", {"json": SET}),
    RequestCase("upsert_fingerprint", (UPSERT,), "POST", "/api/fingerprints", {"json": UPSERT}),
    RequestCase("record_file_stats", (STATS,), "PATCH", "/api/fingerprints", {"json": STATS}),
    RequestCase(
        "list_fingerprints",
        ("chromaprint", "1"),
        "GET",
        "/api/fingerprints",
        {"params": {"fingerprint_type": "chromaprint", "fingerprint_version": "1", "limit": 500, "offset": 1000}},
        PAGE,
    ),
]


def response(status=200, body=b""):
    result = requests.Response()
    result.status_code = status
    result._content = body
    result.raw = io.BytesIO(body)
    result.close = Mock(wraps=result.close)
    return result


def call_case(client, case):
    if case.name == "list_fingerprints":
        return client.list_fingerprints(*case.args, limit=500, offset=1000)
    return getattr(client, case.name)(*case.args)


def assert_matches_schema(value, schema, spec, path="$"):
    """Check a recorded JSON value against the generated OpenAPI schema."""
    if "$ref" in schema:
        name = schema["$ref"].rsplit("/", 1)[-1]
        return assert_matches_schema(value, spec["components"]["schemas"][name], spec, path)
    if "anyOf" in schema:
        errors = []
        for option in schema["anyOf"]:
            try:
                assert_matches_schema(value, option, spec, path)
                return
            except AssertionError as error:
                errors.append(str(error))
        raise AssertionError(f"{path} matches no anyOf option: {errors}")

    types = schema.get("type")
    if types is not None:
        types = [types] if isinstance(types, str) else types
        matches = {
            "null": value is None,
            "object": isinstance(value, dict),
            "array": isinstance(value, list),
            "string": isinstance(value, str),
            "integer": isinstance(value, int) and not isinstance(value, bool),
            "number": isinstance(value, (int, float)) and not isinstance(value, bool),
            "boolean": isinstance(value, bool),
        }
        assert any(matches.get(kind, False) for kind in types), f"{path}: expected {types}, got {value!r}"
    if "enum" in schema:
        assert value in schema["enum"], f"{path}: {value!r} is not in {schema['enum']!r}"
    if isinstance(value, dict):
        missing = set(schema.get("required", [])) - value.keys()
        assert not missing, f"{path}: missing required properties {sorted(missing)}"
        properties = schema.get("properties", {})
        for key, child in value.items():
            if key in properties:
                assert_matches_schema(child, properties[key], spec, f"{path}.{key}")
            elif schema.get("additionalProperties") is False:
                raise AssertionError(f"{path}.{key}: additional property is not allowed")
    if isinstance(value, list) and "items" in schema:
        for index, item in enumerate(value):
            assert_matches_schema(item, schema["items"], spec, f"{path}[{index}]")


@pytest.fixture
def session():
    return Mock(spec=requests.Session)


@pytest.mark.parametrize("case", CASES, ids=lambda case: case.name)
def test_exact_requests_and_return_values(session, case):
    resp = response(body=json.dumps(case.result).encode() if case.result is not None else b"not JSON")
    session.request.return_value = resp
    with GroovenetClient("https://app.test/root/", timeout=42, client_name="worker", session=session) as client:
        result = call_case(client, case)
        session.request.assert_called_once_with(
            case.method,
            "https://app.test/root" + case.path,
            headers={"X-Groovenet-Client": "worker"},
            timeout=42,
            allow_redirects=False,
            **case.kwargs,
        )
        if case.name == "fetch_audio":
            assert result is resp
            resp.close.assert_not_called()
            with result:
                assert list(result.iter_content())
        else:
            assert result == case.result
        resp.close.assert_called_once()
    session.close.assert_called_once()


@pytest.mark.parametrize("case", CASES, ids=lambda case: case.name)
@pytest.mark.parametrize("status", [301, 400, 404, 409, 422, 500, 503])
def test_every_method_raises_for_non_2xx(session, case, status):
    resp = response(status, b'{"error":"rejected"}')
    session.request.return_value = resp
    with pytest.raises(GroovenetApiError) as caught:
        call_case(GroovenetClient(session=session), case)
    assert (caught.value.status, caught.value.message) == (status, "rejected")
    resp.close.assert_called_once()
    assert session.request.call_count == 1  # No hidden retries.


@pytest.mark.parametrize(
    "body, expected",
    [
        (b'{"error":"first","message":"second"}', "first"),
        (b'{"error":"","message":"second"}', "second"),
        (b'{"error":null,"message":"second"}', "second"),
        (b'{"message":"second"}', "second"),
        (b'{"error":false,"message":""}', "HTTP 500"),
        (b"{}", "HTTP 500"),
        (b"null", "HTTP 500"),
        (b"[]", "HTTP 500"),
        (b'"error"', "HTTP 500"),
        (b"42", "HTTP 500"),
        (b"<html>proxy error</html>", "HTTP 500"),
        (b"", "HTTP 500"),
    ],
)
def test_error_message_precedence(session, body, expected):
    session.request.return_value = response(500, body)
    with pytest.raises(GroovenetApiError) as caught:
        GroovenetClient(session=session).update_track(TRACK)
    assert caught.value.status == 500
    assert caught.value.message == expected
    assert str(caught.value) == f"API Error: {expected} (HTTP 500)"


@pytest.mark.parametrize("status", [100, 199, 300, 302, 304, 399, 400, 499, 500, 599])
def test_only_2xx_is_success(session, status):
    session.request.return_value = response(status)
    with pytest.raises(GroovenetApiError):
        GroovenetClient(session=session).update_track(TRACK)


@pytest.mark.parametrize("status", [200, 201, 202, 204, 206, 299])
def test_status_only_calls_accept_empty_success(session, status):
    session.request.return_value = response(status)
    assert GroovenetClient(session=session).update_track(TRACK) is None


@pytest.mark.parametrize("error", [requests.ConnectionError("down"), requests.Timeout("slow")])
def test_transport_errors_propagate_without_retries(session, error):
    session.request.side_effect = error
    with pytest.raises(type(error)) as caught:
        GroovenetClient(session=session).update_track(TRACK)
    assert caught.value is error
    session.request.assert_called_once()


@pytest.mark.parametrize(
    "name, args",
    [
        ("extract_cover_art", ("r1", 7)),
        ("list_fingerprints", ("chromaprint", "1")),
    ],
)
def test_json_consumers_reject_invalid_json_and_close_response(session, name, args):
    resp = response(body=b"not JSON")
    session.request.return_value = resp
    client = GroovenetClient(session=session)
    with pytest.raises(ValueError):
        getattr(client, name)(*args, **({"limit": 1, "offset": 0} if name == "list_fingerprints" else {}))
    resp.close.assert_called_once()


def test_fingerprint_list_preserves_bare_array(session):
    session.request.return_value = response(body=json.dumps(PAGE["fingerprints"]).encode())
    assert (
        GroovenetClient(session=session).list_fingerprints("chromaprint", "1", limit=1, offset=0)
        == PAGE["fingerprints"]
    )


def test_base_url_defaults_and_explicit_override(monkeypatch):
    monkeypatch.delenv("APP_URL", raising=False)
    with GroovenetClient() as client:
        assert client.base_url == "http://app:3000"
        assert client.timeout == 30
        assert isinstance(client.session, requests.Session)
    monkeypatch.setenv("APP_URL", "https://env.test/")
    with GroovenetClient() as client:
        assert client.base_url == "https://env.test"
    with GroovenetClient("https://explicit.test/") as client:
        assert client.base_url == "https://explicit.test"


@pytest.mark.parametrize(
    "name, args, timeout",
    [
        ("report_job_outcome", ("j1",), 10),
        ("extract_cover_art", ("r1", 7), 180),
        ("fetch_audio", ("song.m4a",), 60),
    ],
)
def test_per_request_timeouts(session, name, args, timeout):
    session.request.return_value = response(body=b"{}")
    client = GroovenetClient(session=session, timeout=31)
    result = getattr(client, name)(*args, timeout=timeout)
    assert session.request.call_args.kwargs["timeout"] == timeout
    assert client.timeout == 31
    if name == "fetch_audio":
        result.close()


def test_context_closes_session_even_on_error(session):
    with pytest.raises(RuntimeError), GroovenetClient(session=session):
        raise RuntimeError("failed")
    session.close.assert_called_once()


def test_request_cases_cover_every_endpoint_method():
    methods = {name for name in vars(GroovenetClient) if not name.startswith("_") and name != "close"}
    assert methods == {case.name for case in CASES}


@pytest.mark.parametrize("case", CASES, ids=lambda case: case.name)
def test_requests_exist_in_openapi(session, case):
    spec_path = Path(__file__).resolve().parents[3] / "openapi-generated.json"
    if not spec_path.exists():
        if os.getenv("GROOVENET_REQUIRE_OPENAPI") == "1":
            pytest.fail("Run just generate-spec before the required OpenAPI contract check")
        pytest.skip("Run just generate-spec to check paths/verbs against the app contract")
    spec = json.loads(spec_path.read_text())
    session.request.return_value = response(body=b"{}")
    client = GroovenetClient("https://app.test", session=session)
    result = call_case(client, case)
    if case.name == "fetch_audio":
        result.close()
    method, url = session.request.call_args.args
    path = url.removeprefix(client.base_url)
    matches = [
        template
        for template, operations in spec["paths"].items()
        if method.lower() in operations and re.fullmatch(re.sub(r"\\\{[^}]+\\\}", "[^/]+", re.escape(template)), path)
    ]
    assert matches, f"{method} {path} is missing from OpenAPI"
    template = matches[0]
    operation = spec["paths"][template][method.lower()]
    request_schema = operation.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema")
    if "json" in case.kwargs:
        assert request_schema, f"{method} {template} has no documented JSON request body"
        assert_matches_schema(case.kwargs["json"], request_schema, spec, f"{method} {template} request")
    if case.result is not None:
        response_schema = (
            operation.get("responses", {}).get("200", {}).get("content", {}).get("application/json", {}).get("schema")
        )
        assert response_schema, f"{method} {template} has no documented JSON response"
        assert_matches_schema(case.result, response_schema, spec, f"{method} {template} response")


def test_broken_error_body_still_raises_api_error_and_closes_response(session):
    resp = response(502)
    resp.json = Mock(side_effect=requests.exceptions.ChunkedEncodingError("truncated error body"))
    session.request.return_value = resp
    with pytest.raises(GroovenetApiError) as caught:
        GroovenetClient(session=session).update_track(TRACK)
    assert (caught.value.status, caught.value.message) == (502, "HTTP 502")
    resp.close.assert_called_once()
