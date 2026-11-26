"""Wrapper v2 1.0.0 HTTP stub; never starts a real wrapper or Apple session."""

import asyncio
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace

import pytest
import requests
from gamdl.api import WrapperApi
from worker import main as worker_main
from worker import wrapper, wrapper_cli

INFO = {
    "version": "1.0.0",
    "protocol_version": 1,
    "architecture": "x86_64",
    "profile": "apple-music-1109-x86_64",
    "context_supported": True,
    "context_format": "temari",
    "decryption": "client_side",
}


@pytest.fixture
def stub():
    data = SimpleNamespace(
        info=dict(INFO),
        state="authenticated",
        restore=False,
        restore_status=200,
        status=200,
        invalid_json=False,
        malformed_session=False,
        two_factor=False,
        challenge={"kind": "two_factor", "challenge_id": "synthetic-challenge"},
        paths=[],
    )

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            data.paths.append(("GET", self.path))
            if self.path == "/info":
                body = data.info
            elif self.path == "/session/credentials":
                body = {"dev_token": "synthetic-dev", "music_user_token": "synthetic-user"}
            else:
                body = [] if data.malformed_session else {"state": data.state}
            self.reply(body)

        def do_POST(self):
            # Consume and discard synthetic input; never store/log request bodies.
            self.rfile.read(int(self.headers.get("Content-Length", "0")))
            data.paths.append(("POST", self.path))
            if self.path == "/session/restore":
                if data.restore:
                    data.state = "authenticated"
                self.reply({}, data.restore_status)
            elif self.path == "/session/login" and data.two_factor:
                self.reply(data.challenge, 202)
            else:
                data.state = "authenticated"
                self.reply({})

        def reply(self, body, status=None):
            self.send_response(status or data.status)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b"invalid" if data.invalid_json else json.dumps(body).encode())

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    data.url = f"http://127.0.0.1:{server.server_port}"
    yield data
    server.shutdown()
    server.server_close()
    thread.join()


@pytest.mark.parametrize(
    "profiles,expected",
    [
        ("", None),
        ("all", None),
        ("downloads", None),
        ("downloads,lossless", "http://gamdl-wrapper:80"),
        ("lossless downloads", "http://gamdl-wrapper:80"),
    ],
)
def test_profile_scoped_default(monkeypatch, profiles, expected):
    monkeypatch.delenv("GAMDL_WRAPPER_URL", raising=False)
    monkeypatch.setenv("COMPOSE_PROFILES", profiles)
    assert wrapper.wrapper_url() == expected
    monkeypatch.setenv("GAMDL_WRAPPER_URL", " http://explicit:80 ")
    assert wrapper.wrapper_url() == "http://explicit:80"


def test_ready_and_restore(stub):
    wrapper.check_wrapper_ready(stub.url)
    assert stub.paths == [("GET", "/info"), ("GET", "/session")]
    stub.state = "logged_out"
    stub.restore = True
    wrapper.check_wrapper_ready(stub.url)
    assert ("POST", "/session/restore") in stub.paths


@pytest.mark.parametrize("state", ["logged_out", "two_factor", "unknown"])
def test_signed_out_is_actionable(stub, state):
    stub.state = state
    with pytest.raises(wrapper.WrapperNotReady, match="just wrapper-login"):
        wrapper.check_wrapper_ready(stub.url)
    assert all(path != "/session/login" for _, path in stub.paths)


@pytest.mark.parametrize(
    "patch",
    [
        {"version": "0.0.2"},
        {"version": "1.0.1"},
        {"architecture": "arm64-v8a", "profile": "apple-music-1109-arm64-v8a"},
        {"profile": "wrong"},
        {"protocol_version": 2},
        {"context_supported": False},
        {"context_format": "wrong"},
        {"decryption": "server_side"},
    ],
)
def test_requires_exact_amd64_profile(stub, patch):
    stub.info.update(patch)
    with pytest.raises(wrapper.WrapperNotReady, match="version 1.0.0.*amd64"):
        wrapper.check_wrapper_ready(stub.url)
    assert stub.paths == [("GET", "/info")]


@pytest.mark.parametrize("kind", ["info-list", "invalid-json", "http", "session-list", "session-invalid-json"])
def test_invalid_or_unavailable_response_is_sanitized(stub, kind, monkeypatch):
    if kind == "info-list":
        stub.info = []
    if kind == "invalid-json":
        stub.invalid_json = True
    if kind == "http":
        stub.status = 503
    if kind == "session-list":
        stub.malformed_session = True
    if kind == "session-invalid-json":
        monkeypatch.setattr(wrapper, "wrapper_info", lambda url: None)
        stub.invalid_json = True
    with pytest.raises(wrapper.WrapperNotReady):
        wrapper.check_wrapper_ready(stub.url)


@pytest.mark.parametrize("error", [requests.Timeout, requests.ConnectionError])
def test_network_failure_has_no_response_or_url(monkeypatch, error):
    monkeypatch.setattr(
        requests.Session, "request", lambda *a, **k: (_ for _ in ()).throw(error("synthetic-sensitive-value"))
    )
    with pytest.raises(wrapper.WrapperNotReady, match="unreachable") as caught:
        wrapper.check_wrapper_ready("http://synthetic-sensitive-value")
    assert "synthetic-sensitive-value" not in str(caught.value)


def test_gamdl_real_wrapper_client_accepts_stub_and_exports_only_synthetic_tokens(stub, caplog):
    async def run():
        async with await WrapperApi.create(base_url=stub.url) as api:
            credentials = await api.get_credentials()
            assert set(credentials) == {"dev_token", "music_user_token"}

    asyncio.run(run())
    assert ("GET", "/session/credentials") in stub.paths
    assert "synthetic-dev" not in caplog.text


@pytest.mark.parametrize("state", [None, "authenticated", "logged_out"])
def test_startup_probe_does_not_break_aac(stub, monkeypatch, state, caplog):
    monkeypatch.delenv("COMPOSE_PROFILES", raising=False)
    if state is None:
        monkeypatch.delenv("GAMDL_WRAPPER_URL", raising=False)
    else:
        monkeypatch.setenv("GAMDL_WRAPPER_URL", stub.url)
        stub.state = state
    worker_main.probe_wrapper()
    if state == "logged_out":
        assert "Lossless unavailable" in caplog.text


@pytest.mark.parametrize("two_factor", [False, True])
def test_owner_login_hidden_input_and_no_secret_output(stub, monkeypatch, capsys, two_factor):
    stub.state = "logged_out"
    stub.two_factor = two_factor
    prompts = []

    def hidden(prompt):
        prompts.append(prompt)
        return "123456" if "2FA" in prompt else "synthetic-private-input"

    monkeypatch.setattr(wrapper_cli.getpass, "getpass", hidden)
    wrapper_cli.login(stub.url)
    output = capsys.readouterr().out
    assert "signed in" in output
    assert "synthetic-private-input" not in output and "123456" not in output
    assert len(prompts) == (3 if two_factor else 2)
    assert ("POST", "/session/login") in stub.paths
    assert (("POST", "/session/challenge") in stub.paths) == two_factor


def test_already_signed_in_does_not_prompt(stub, monkeypatch):
    monkeypatch.setattr(wrapper_cli.getpass, "getpass", lambda prompt: pytest.fail("must not prompt"))
    wrapper_cli.login(stub.url)


@pytest.mark.parametrize(
    "challenge",
    [{"kind": "other"}, {"kind": "two_factor", "challenge_id": 1}, {"kind": "two_factor", "challenge_id": ""}],
)
def test_login_rejects_invalid_challenge(stub, monkeypatch, challenge):
    stub.state, stub.two_factor, stub.challenge = "logged_out", True, challenge
    monkeypatch.setattr(wrapper_cli.getpass, "getpass", lambda prompt: "synthetic")
    with pytest.raises(wrapper.WrapperNotReady, match="invalid two-factor"):
        wrapper_cli.login(stub.url)


@pytest.mark.parametrize("code", ["12", "abcdef", "１２３４５６"])
def test_login_rejects_invalid_code(stub, monkeypatch, code):
    stub.state, stub.two_factor = "logged_out", True
    monkeypatch.setattr(wrapper_cli.getpass, "getpass", lambda prompt: code)
    with pytest.raises(wrapper.WrapperNotReady, match="six-digit"):
        wrapper_cli.login(stub.url)


@pytest.mark.parametrize(
    "action,mode,expected",
    [
        ("status", "ready", 0),
        ("login", "ready", 0),
        ("status", "unset", 1),
        ("status", "out", 1),
        ("login", "invalid", 1),
        ("login", "cancel", 1),
    ],
)
def test_cli_safe_status_and_errors(stub, monkeypatch, action, mode, expected, capsys):
    monkeypatch.setattr("sys.argv", ["wrapper", action])
    monkeypatch.setattr(wrapper_cli, "wrapper_url", lambda: None if mode == "unset" else stub.url)
    if mode == "out":
        stub.state = "logged_out"
    if mode in ("invalid", "cancel"):
        error = ValueError if mode == "invalid" else EOFError
        monkeypatch.setattr(wrapper_cli, "login", lambda url: (_ for _ in ()).throw(error()))
    assert wrapper_cli.main() == expected
    assert "Traceback" not in capsys.readouterr().out


def test_missing_cached_session_is_an_actionable_sign_in_error(stub):
    stub.state = "logged_out"
    stub.restore_status = 404
    with pytest.raises(wrapper.WrapperNotReady, match="just wrapper-login"):
        wrapper.check_wrapper_ready(stub.url)
