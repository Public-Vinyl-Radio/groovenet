"""The structured event logger (#280): what may reach a log line, and how."""
import json
import logging

import pytest
from fingerprint_service.observability import (
    ALLOWED_FIELDS,
    MAX_STRING,
    elapsed_ms,
    log_event,
    queue_wait_ms,
    redact,
    sanitize,
)


class TestSanitize:
    def test_drops_fields_not_on_the_allowlist(self):
        assert sanitize({"ingest_id": "a", "file_path": "x.wav", "payload": "{}"}) == {"ingest_id": "a"}

    @pytest.mark.parametrize(
        "value",
        [b"RIFF\x00\x00", bytearray(b"pcm"), memoryview(b"pcm"), {"k": "v"}, ["a"], object()],
    )
    def test_drops_anything_that_is_not_a_scalar(self, value):
        assert sanitize({"error": value}) == {}

    def test_keeps_scalars_and_explicit_nulls(self):
        fields = {"sequence": 7, "confidence": 0.9, "track_id": None, "status": "processed"}
        assert sanitize(fields) == fields

    def test_keeps_booleans(self):
        assert "candidates" in ALLOWED_FIELDS
        assert sanitize({"candidates": True}) == {"candidates": True}

    def test_drops_non_finite_numbers_json_cannot_carry(self):
        assert sanitize({"level_dbfs": float("-inf"), "confidence": float("nan")}) == {}


class TestRedact:
    @pytest.mark.parametrize(
        ("text", "secret"),
        [
            ("Authorization: Bearer abc.def.ghi", "abc.def.ghi"),
            ("GET /x?token=s3cret&y=1", "s3cret"),
            ("password=hunter2", "hunter2"),
            ("api_key: k-123", "k-123"),
            ("redis://default:pa55@redis:6379", "pa55"),
            ("http://user:pw@app:3000/api", "pw"),
        ],
    )
    def test_scrubs_credential_shapes(self, text, secret):
        assert secret not in redact(text)
        assert "[redacted]" in redact(text)

    def test_leaves_ordinary_text_alone(self):
        text = "ffmpeg exited 1: Invalid data found when processing input"
        assert redact(text) == text

    def test_caps_the_length(self):
        assert len(redact("x" * 10_000)) == MAX_STRING


class TestLogEvent:
    def test_writes_one_parseable_json_line(self, events):
        log_event("ingest.picked_up", ingest_id="a", sequence=3, pcm=b"\x01\x02")
        [line] = events()
        assert line["event"] == "ingest.picked_up"
        assert line["component"] == "fingerprint-service"
        assert line["level"] == "info"
        assert line["ingest_id"] == "a"
        assert "pcm" not in line
        assert line["ts"].endswith("Z")

    def test_honours_the_level(self, events, caplog):
        log_event("ingest.failed", level=logging.ERROR, stage="decode")
        assert events()[0]["level"] == "error"
        assert caplog.records[-1].levelno == logging.ERROR

    def test_does_not_propagate_to_the_prefixed_root_format(self):
        # The root handler would prefix a timestamp and break "one line is one
        # JSON object".
        assert logging.getLogger("fingerprint_service.events").propagate is False

    def test_returns_what_it_wrote(self):
        line = log_event("x", ingest_id="a")
        assert json.loads(json.dumps(line))["ingest_id"] == "a"


class TestTiming:
    def test_queue_wait_is_measured_from_the_stamp(self):
        from datetime import datetime

        stamp = datetime.fromisoformat("2026-09-20T18:42:10+00:00").timestamp()
        assert queue_wait_ms("2026-09-20T18:42:10Z", now=stamp + 1.5) == 1500

    @pytest.mark.parametrize("value", [None, "", "not a date"])
    def test_an_unusable_stamp_is_unknown(self, value):
        assert queue_wait_ms(value) is None

    def test_a_clock_that_runs_backwards_is_unknown(self):
        assert queue_wait_ms("2999-01-01T00:00:00Z") is None

    def test_elapsed_is_whole_milliseconds(self):
        import time

        assert isinstance(elapsed_ms(time.monotonic()), int)
