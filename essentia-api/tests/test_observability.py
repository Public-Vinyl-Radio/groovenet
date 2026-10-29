import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import essentia_api
import observability


def test_init_sentry_is_noop_without_dsn(monkeypatch):
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    assert observability.init_sentry() is False


def test_init_sentry_uses_exception_only_configuration(monkeypatch):
    sdk = Mock()
    monkeypatch.setitem(sys.modules, "sentry_sdk", SimpleNamespace(init=sdk.init, set_tag=sdk.set_tag))
    monkeypatch.setenv("SENTRY_DSN", "https://public@example.invalid/1")
    monkeypatch.setenv("SENTRY_RELEASE", "0.3.2")

    assert observability.init_sentry() is True
    options = sdk.init.call_args.kwargs
    assert options["release"] == "0.3.2"
    assert options["default_integrations"] is False
    assert options["integrations"] == []
    assert options["send_default_pii"] is False
    assert options["include_local_variables"] is False
    assert callable(options["before_send"])
    assert "traces_sample_rate" not in options
    event = {
        "request": {},
        "user": {},
        "extra": {},
        "breadcrumbs": [],
        "exception": {
            "values": [
                {
                    "value": "secret",
                    "stacktrace": {
                        "frames": [{"filename": "/app/essentia_api.py", "abs_path": "/app/essentia_api.py"}, {}]
                    },
                }
            ]
        },
    }
    scrubbed = options["before_send"](event, {})
    assert not {"request", "user", "extra", "breadcrumbs"} & scrubbed.keys()
    assert scrubbed["exception"]["values"][0]["value"] == "Exception details redacted"
    assert scrubbed["exception"]["values"][0]["stacktrace"]["frames"][0]["filename"] == "essentia_api.py"
    assert scrubbed["exception"]["values"][0]["stacktrace"]["frames"][0]["abs_path"] == "essentia_api.py"
    assert sdk.set_tag.call_args_list == [
        (("service", "essentia-api"),),
        (("release", "0.3.2"),),
    ]


def test_capture_exception_only_sends_when_configured(monkeypatch):
    sdk = Mock()
    monkeypatch.setitem(sys.modules, "sentry_sdk", SimpleNamespace(capture_exception=sdk.capture_exception))
    error = RuntimeError("failure")
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    observability.capture_exception(error)
    sdk.capture_exception.assert_not_called()

    monkeypatch.setenv("SENTRY_DSN", "https://public@example.invalid/1")
    observability.capture_exception(error)
    sdk.capture_exception.assert_called_once_with(error)


def test_optional_release_and_empty_exception_context(monkeypatch):
    sdk = Mock()
    monkeypatch.setitem(sys.modules, "sentry_sdk", SimpleNamespace(init=sdk.init, set_tag=sdk.set_tag))
    monkeypatch.setenv("SENTRY_DSN", "https://public@example.invalid/1")
    monkeypatch.delenv("SENTRY_RELEASE", raising=False)
    assert observability.init_sentry() is True
    assert sdk.init.call_args.kwargs["release"] is None
    assert sdk.set_tag.call_args_list == [(("service", "essentia-api"),)]
    event = {"exception": {"values": [{"value": "secret", "stacktrace": None}]}}
    assert (
        sdk.init.call_args.kwargs["before_send"](event, {})["exception"]["values"][0]["value"]
        == "Exception details redacted"
    )


def test_http_middleware_reports_unhandled_exception(monkeypatch):
    capture = Mock()
    error = RuntimeError("request failed")
    monkeypatch.setattr(essentia_api, "capture_exception", capture)

    async def call_next(_request):
        raise error

    with pytest.raises(RuntimeError) as raised:
        asyncio.run(essentia_api.capture_unhandled_exceptions(object(), call_next))
    assert raised.value is error
    capture.assert_called_once_with(error)
