"""Tests for download.py internals: cookie resolution, the yt-dlp strategy
ladder, and stderr parsing. The gamdl API port is in test_jobs_download_gamdl.py."""

import os
import subprocess
from unittest.mock import patch

import pytest
from worker.jobs.download import (
    _extract_ytdlp_error,
    download_with_ytdlp,
    resolve_gamdl_cookie_file,
)


def make_proc(returncode=0, stdout="", stderr=""):
    return subprocess.CompletedProcess(args=[], returncode=returncode, stdout=stdout, stderr=stderr)


def write_audio(path, size=1024):
    """Create a non-empty file; gamdl discovery skips zero-byte files."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(b"\0" * size)
    return path


# ---------------------------------------------------------------------------
# resolve_gamdl_cookie_file
# ---------------------------------------------------------------------------


class TestResolveGamdlCookieFile:
    def test_prefers_an_existing_configured_path(self, tmp_path, monkeypatch):
        configured = tmp_path / "cookies.txt"
        configured.write_text("apple")
        monkeypatch.setenv("GAMDL_COOKIE_FILE", str(configured))

        assert resolve_gamdl_cookie_file() == str(configured)

    def test_falls_back_to_a_legacy_path_when_it_exists(self, tmp_path, monkeypatch):
        monkeypatch.delenv("GAMDL_COOKIE_FILE", raising=False)
        legacy = "/app/cookies/gamdl_cookies.txt"
        monkeypatch.setattr(os.path, "exists", lambda p: p == legacy)

        assert resolve_gamdl_cookie_file() == legacy

    def test_prefers_the_second_legacy_path_when_the_first_is_absent(self, monkeypatch):
        monkeypatch.delenv("GAMDL_COOKIE_FILE", raising=False)
        second = "/app/cookies/music.apple.com_cookies.txt"
        monkeypatch.setattr(os.path, "exists", lambda p: p == second)

        assert resolve_gamdl_cookie_file() == second

    def test_returns_the_configured_path_even_when_nothing_exists(self, monkeypatch):
        """Callers warn about a missing file, so the configured path is still returned."""
        monkeypatch.setenv("GAMDL_COOKIE_FILE", "/nope/cookies.txt")
        monkeypatch.setattr(os.path, "exists", lambda p: False)

        assert resolve_gamdl_cookie_file() == "/nope/cookies.txt"

    def test_returns_none_when_unset_and_no_fallback_exists(self, monkeypatch):
        monkeypatch.delenv("GAMDL_COOKIE_FILE", raising=False)
        monkeypatch.setattr(os.path, "exists", lambda p: False)

        assert resolve_gamdl_cookie_file() is None

    def test_does_not_probe_a_duplicated_candidate_twice(self, monkeypatch):
        """A configured path equal to a legacy path must not be checked twice."""
        legacy = "/app/cookies/gamdl_cookies.txt"
        monkeypatch.setenv("GAMDL_COOKIE_FILE", legacy)
        probed = []

        def exists(p):
            probed.append(p)
            return False

        monkeypatch.setattr(os.path, "exists", exists)

        resolve_gamdl_cookie_file()

        assert probed.count(legacy) == 1


# ---------------------------------------------------------------------------
# download_with_ytdlp
# ---------------------------------------------------------------------------


class TestDownloadWithYtdlp:
    @patch("worker.jobs.download.run_subprocess")
    def test_returns_on_the_first_successful_strategy(self, mock_run, tmp_path):
        write_audio(str(tmp_path / "t1.m4a"))
        mock_run.return_value = make_proc(returncode=0)

        result = download_with_ytdlp("https://youtu.be/x", str(tmp_path), "t1")

        assert result.endswith("t1.m4a")
        assert mock_run.call_count == 1

    @patch("worker.jobs.download.run_subprocess")
    def test_uses_the_android_client_first(self, mock_run, tmp_path):
        write_audio(str(tmp_path / "t1.m4a"))
        mock_run.return_value = make_proc(returncode=0)

        download_with_ytdlp("https://youtu.be/x", str(tmp_path), "t1")

        assert "youtube:player_client=android" in mock_run.call_args[0][0]

    @patch("worker.jobs.download.run_subprocess")
    def test_advances_to_the_next_strategy_on_failure(self, mock_run, tmp_path):
        calls = []

        def run(args, **kw):
            calls.append(args)
            if len(calls) < 3:
                return make_proc(returncode=1, stderr="ERROR: blocked")
            write_audio(str(tmp_path / "t1.m4a"))
            return make_proc(returncode=0)

        mock_run.side_effect = run

        result = download_with_ytdlp("https://youtu.be/x", str(tmp_path), "t1")

        assert result.endswith("t1.m4a")
        assert len(calls) == 3

    @patch("worker.jobs.download.run_subprocess")
    def test_reports_the_last_error_when_every_strategy_fails(self, mock_run, tmp_path):
        mock_run.return_value = make_proc(returncode=1, stderr="ERROR: video unavailable")

        with pytest.raises(Exception, match="video unavailable"):
            download_with_ytdlp("https://youtu.be/x", str(tmp_path), "t1")

        assert mock_run.call_count == 4

    @patch("worker.jobs.download.run_subprocess")
    def test_a_timeout_does_not_abort_the_ladder(self, mock_run, tmp_path):
        mock_run.side_effect = subprocess.TimeoutExpired(cmd="yt-dlp", timeout=300)

        with pytest.raises(Exception, match="Download timeout"):
            download_with_ytdlp("https://youtu.be/x", str(tmp_path), "t1")

        assert mock_run.call_count == 4

    @patch("worker.jobs.download.run_subprocess")
    def test_an_unexpected_error_does_not_abort_the_ladder(self, mock_run, tmp_path):
        mock_run.side_effect = RuntimeError("boom")

        with pytest.raises(Exception, match="boom"):
            download_with_ytdlp("https://youtu.be/x", str(tmp_path), "t1")

        assert mock_run.call_count == 4

    @patch("worker.jobs.download.run_subprocess")
    def test_keeps_trying_when_a_strategy_exits_0_without_a_file(self, mock_run, tmp_path):
        mock_run.return_value = make_proc(returncode=0)

        with pytest.raises(Exception, match="All download strategies failed"):
            download_with_ytdlp("https://youtu.be/x", str(tmp_path), "t1")

        assert mock_run.call_count == 4

    @patch("worker.jobs.download.run_subprocess")
    def test_ignores_files_belonging_to_another_track(self, mock_run, tmp_path):
        write_audio(str(tmp_path / "other.m4a"))
        mock_run.return_value = make_proc(returncode=0)

        with pytest.raises(Exception, match="All download strategies failed"):
            download_with_ytdlp("https://youtu.be/x", str(tmp_path), "t1")

    @patch("worker.jobs.download.run_subprocess")
    def test_accepts_an_mp3_result(self, mock_run, tmp_path):
        write_audio(str(tmp_path / "t1.mp3"))
        mock_run.return_value = make_proc(returncode=0)

        assert download_with_ytdlp("https://youtu.be/x", str(tmp_path), "t1").endswith(".mp3")

    @patch("worker.jobs.download.run_subprocess")
    def test_wraps_the_failure_as_a_ytdlp_error(self, mock_run, tmp_path):
        mock_run.return_value = make_proc(returncode=1, stderr="ERROR: nope")

        with pytest.raises(Exception, match="yt-dlp error:"):
            download_with_ytdlp("https://youtu.be/x", str(tmp_path), "t1")


# ---------------------------------------------------------------------------
# _extract_ytdlp_error
# ---------------------------------------------------------------------------


class TestExtractYtdlpError:
    def test_returns_the_first_error_line_without_its_prefix(self):
        stderr = "[info] downloading\nERROR: Video unavailable\nERROR: second"

        assert _extract_ytdlp_error(stderr) == "Video unavailable"

    def test_ignores_leading_whitespace(self):
        assert _extract_ytdlp_error("   ERROR:  spaced  ") == "spaced"

    def test_falls_back_to_the_whole_stderr_when_no_error_line(self):
        assert _extract_ytdlp_error("just some warning text") == "just some warning text"

    @pytest.mark.parametrize("value", ["", None])
    def test_handles_empty_input(self, value):
        assert _extract_ytdlp_error(value) == ""
