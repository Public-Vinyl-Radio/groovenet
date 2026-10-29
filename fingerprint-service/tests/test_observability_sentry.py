import sys
from types import SimpleNamespace
from unittest.mock import Mock

from fingerprint_service import sentry


def test_init_sentry_is_noop_without_dsn(monkeypatch):
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    assert sentry.init_sentry() is False


def test_init_sentry_uses_exception_only_configuration(monkeypatch):
    sdk = Mock()
    monkeypatch.setitem(sys.modules, "sentry_sdk", SimpleNamespace(init=sdk.init, set_tag=sdk.set_tag))
    monkeypatch.setenv("SENTRY_DSN", "https://public@example.invalid/1")
    monkeypatch.setenv("SENTRY_RELEASE", "0.3.2")
    monkeypatch.setenv("SENTRY_SERVICE", "fingerprint-set-worker")

    assert sentry.init_sentry() is True
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
                        "frames": [
                            {
                                "filename": "/app/fingerprint_service/main.py",
                                "abs_path": "/app/fingerprint_service/main.py",
                            },
                            {},
                        ]
                    },
                }
            ]
        },
    }
    scrubbed = options["before_send"](event, {})
    assert not {"request", "user", "extra", "breadcrumbs"} & scrubbed.keys()
    assert scrubbed["exception"]["values"][0]["value"] == "Exception details redacted"
    assert scrubbed["exception"]["values"][0]["stacktrace"]["frames"][0]["filename"] == "main.py"
    assert scrubbed["exception"]["values"][0]["stacktrace"]["frames"][0]["abs_path"] == "main.py"
    assert sdk.set_tag.call_args_list == [
        (("service", "fingerprint-set-worker"),),
        (("release", "0.3.2"),),
    ]


def test_capture_exception_only_sends_when_configured(monkeypatch):
    sdk = Mock()
    monkeypatch.setitem(sys.modules, "sentry_sdk", SimpleNamespace(capture_exception=sdk.capture_exception))
    error = RuntimeError("failure")
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    sentry.capture_exception(error)
    sdk.capture_exception.assert_not_called()

    monkeypatch.setenv("SENTRY_DSN", "https://public@example.invalid/1")
    sentry.capture_exception(error)
    sdk.capture_exception.assert_called_once_with(error)


def test_optional_release_and_empty_exception_context(monkeypatch):
    sdk = Mock()
    monkeypatch.setitem(sys.modules, "sentry_sdk", SimpleNamespace(init=sdk.init, set_tag=sdk.set_tag))
    monkeypatch.setenv("SENTRY_DSN", "https://public@example.invalid/1")
    monkeypatch.delenv("SENTRY_RELEASE", raising=False)
    assert sentry.init_sentry() is True
    assert sdk.init.call_args.kwargs["release"] is None
    assert sdk.set_tag.call_args_list == [(("service", "fingerprint-service"),)]
    event = {"exception": {"values": [{"value": "secret", "stacktrace": None}]}}
    assert (
        sdk.init.call_args.kwargs["before_send"](event, {})["exception"]["values"][0]["value"]
        == "Exception details redacted"
    )
