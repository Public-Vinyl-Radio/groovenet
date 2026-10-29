import sys
from types import SimpleNamespace
from unittest.mock import Mock

from worker import observability


def test_init_sentry_is_noop_without_dsn(monkeypatch):
    monkeypatch.delenv("SENTRY_DSN", raising=False)

    assert observability.init_sentry() is False


def test_init_sentry_disables_automatic_data_collection(monkeypatch):
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
        "request": {"data": "sensitive"},
        "user": {"id": "private"},
        "extra": {"token": "secret"},
        "breadcrumbs": [{"message": "private"}],
        "exception": {
            "values": [
                {
                    "value": "secret token",
                    "stacktrace": {
                        "frames": [{"filename": "/app/worker/main.py", "abs_path": "/app/worker/main.py"}, {}]
                    },
                }
            ]
        },
    }
    scrubbed = options["before_send"](event, {})
    assert "request" not in scrubbed and "user" not in scrubbed
    assert "extra" not in scrubbed and "breadcrumbs" not in scrubbed
    assert scrubbed["exception"]["values"][0]["value"] == "Exception details redacted"
    assert scrubbed["exception"]["values"][0]["stacktrace"]["frames"][0]["filename"] == "main.py"
    assert scrubbed["exception"]["values"][0]["stacktrace"]["frames"][0]["abs_path"] == "main.py"
    assert sdk.set_tag.call_args_list == [
        (("service", "download-worker"),),
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
    assert sdk.set_tag.call_args_list == [(("service", "download-worker"),)]
    event = {"exception": {"values": [{"value": "secret", "stacktrace": None}]}}
    assert (
        sdk.init.call_args.kwargs["before_send"](event, {})["exception"]["values"][0]["value"]
        == "Exception details redacted"
    )
