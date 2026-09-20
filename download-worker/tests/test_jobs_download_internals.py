"""Tests for download.py internals: cookie resolution, gamdl file discovery,
the yt-dlp strategy ladder, and stderr parsing."""
import os
import subprocess
from unittest.mock import patch

import pytest
from worker.jobs.download import (
    _extract_ytdlp_error,
    download_with_gamdl,
    download_with_ytdlp,
    resolve_gamdl_cookie_file,
)


def make_proc(returncode=0, stdout="", stderr=""):
    return subprocess.CompletedProcess(
        args=[], returncode=returncode, stdout=stdout, stderr=stderr
    )


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
# download_with_gamdl — error classification not already covered
# ---------------------------------------------------------------------------

class TestGamdlErrorClassification:
    @pytest.mark.parametrize(
        "stderr,expected",
        [
            ("Track not available in this region", "not available in your region"),
            ("geo restricted", "not available in your region"),
            ("premium account required", "subscription required"),
            ("subscription needed", "subscription required"),
            ("too many requests", "Rate limited"),
            ("something else entirely", "gamdl failed"),
        ],
    )
    @patch("worker.jobs.download.run_subprocess")
    def test_classifies_stderr(self, mock_run, tmp_path, stderr, expected):
        mock_run.return_value = make_proc(returncode=1, stderr=stderr)

        with pytest.raises(Exception, match=expected):
            download_with_gamdl("https://music.apple.com/x", str(tmp_path), "t1")

    @patch("worker.jobs.download.run_subprocess")
    def test_a_timeout_becomes_a_clear_message(self, mock_run, tmp_path):
        mock_run.side_effect = subprocess.TimeoutExpired(cmd="gamdl", timeout=600)

        with pytest.raises(Exception, match="Download timeout"):
            download_with_gamdl("https://music.apple.com/x", str(tmp_path), "t1")

    @patch("worker.jobs.download.run_subprocess")
    def test_does_not_double_prefix_an_already_prefixed_error(self, mock_run, tmp_path):
        mock_run.side_effect = Exception("gamdl error: already tagged")

        with pytest.raises(Exception) as exc:
            download_with_gamdl("https://music.apple.com/x", str(tmp_path), "t1")

        assert str(exc.value).count("gamdl error:") == 1


# ---------------------------------------------------------------------------
# download_with_gamdl — cookie file handling
# ---------------------------------------------------------------------------

class TestGamdlCookieHandling:
    @patch("worker.jobs.download.run_subprocess")
    def test_passes_a_valid_cookie_file_to_gamdl(self, mock_run, tmp_path, monkeypatch):
        cookies = tmp_path / "cookies.txt"
        cookies.write_text("# apple music cookie\nfoo\tapple\tbar")
        monkeypatch.setenv("GAMDL_COOKIE_FILE", str(cookies))
        write_audio(str(tmp_path / "out" / "t1.m4a"))
        mock_run.return_value = make_proc(returncode=0)

        download_with_gamdl("https://music.apple.com/x", str(tmp_path / "out"), "t1")

        cmd = mock_run.call_args[0][0]
        assert "--cookies-path" in cmd
        assert str(cookies) in cmd

    @patch("worker.jobs.download.run_subprocess")
    def test_skips_an_empty_cookie_file(self, mock_run, tmp_path, monkeypatch):
        cookies = tmp_path / "cookies.txt"
        cookies.write_text("   ")
        monkeypatch.setenv("GAMDL_COOKIE_FILE", str(cookies))
        write_audio(str(tmp_path / "out" / "t1.m4a"))
        mock_run.return_value = make_proc(returncode=0)

        download_with_gamdl("https://music.apple.com/x", str(tmp_path / "out"), "t1")

        assert "--cookies-path" not in mock_run.call_args[0][0]

    @patch("worker.jobs.download.run_subprocess")
    def test_skips_a_cookie_file_without_apple_entries(self, mock_run, tmp_path, monkeypatch):
        cookies = tmp_path / "cookies.txt"
        cookies.write_text("some.other.domain\tvalue")
        monkeypatch.setenv("GAMDL_COOKIE_FILE", str(cookies))
        write_audio(str(tmp_path / "out" / "t1.m4a"))
        mock_run.return_value = make_proc(returncode=0)

        download_with_gamdl("https://music.apple.com/x", str(tmp_path / "out"), "t1")

        assert "--cookies-path" not in mock_run.call_args[0][0]

    @patch("worker.jobs.download.run_subprocess")
    def test_proceeds_when_the_configured_cookie_file_is_missing(
        self, mock_run, tmp_path, monkeypatch
    ):
        monkeypatch.setenv("GAMDL_COOKIE_FILE", str(tmp_path / "absent.txt"))
        write_audio(str(tmp_path / "out" / "t1.m4a"))
        mock_run.return_value = make_proc(returncode=0)

        result = download_with_gamdl("https://music.apple.com/x", str(tmp_path / "out"), "t1")

        assert result.endswith("t1.m4a")


# ---------------------------------------------------------------------------
# download_with_gamdl — quality and file discovery
# ---------------------------------------------------------------------------

class TestGamdlQuality:
    @patch("worker.jobs.download.run_subprocess")
    def test_omits_audio_quality_when_best(self, mock_run, tmp_path, monkeypatch):
        monkeypatch.delenv("GAMDL_COOKIE_FILE", raising=False)
        write_audio(str(tmp_path / "out" / "t1.m4a"))
        mock_run.return_value = make_proc(returncode=0)

        download_with_gamdl(
            "https://music.apple.com/x", str(tmp_path / "out"), "t1",
            job_data={"track_id": "t1", "friend_id": 1, "quality": "best"},
        )

        assert "--audio-quality" not in mock_run.call_args[0][0]

    @patch("worker.jobs.download.run_subprocess")
    def test_passes_an_explicit_quality(self, mock_run, tmp_path, monkeypatch):
        monkeypatch.delenv("GAMDL_COOKIE_FILE", raising=False)
        write_audio(str(tmp_path / "out" / "t1.m4a"))
        mock_run.return_value = make_proc(returncode=0)

        download_with_gamdl(
            "https://music.apple.com/x", str(tmp_path / "out"), "t1",
            job_data={"track_id": "t1", "friend_id": 1, "quality": "128k"},
        )

        cmd = mock_run.call_args[0][0]
        assert cmd[cmd.index("--audio-quality") + 1] == "128k"


class TestGamdlFileDiscovery:
    @pytest.fixture(autouse=True)
    def no_cookies(self, monkeypatch):
        monkeypatch.delenv("GAMDL_COOKIE_FILE", raising=False)

    @patch("worker.jobs.download.run_subprocess")
    def test_returns_the_largest_audio_file(self, mock_run, tmp_path):
        out = tmp_path / "out"
        write_audio(str(out / "small.m4a"), size=10)
        write_audio(str(out / "large.m4a"), size=5000)
        mock_run.return_value = make_proc(returncode=0)

        result = download_with_gamdl("https://music.apple.com/x", str(out), "t1")

        assert result.endswith("large.m4a")

    @patch("worker.jobs.download.run_subprocess")
    def test_finds_audio_nested_in_subdirectories(self, mock_run, tmp_path):
        out = tmp_path / "out"
        out.mkdir()
        write_audio(str(out / "Album" / "Disc 1" / "track.m4a"))
        mock_run.return_value = make_proc(returncode=0)

        result = download_with_gamdl("https://music.apple.com/x", str(out), "t1")

        assert result.endswith("track.m4a")

    @patch("worker.jobs.download.run_subprocess")
    def test_ignores_zero_byte_files(self, mock_run, tmp_path):
        out = tmp_path / "out"
        write_audio(str(out / "empty.m4a"), size=0)
        mock_run.return_value = make_proc(returncode=0)

        with pytest.raises(Exception, match="Downloaded file not found"):
            download_with_gamdl("https://music.apple.com/x", str(out), "t1")

    @patch("worker.jobs.download.run_subprocess")
    def test_ignores_non_audio_extensions(self, mock_run, tmp_path):
        out = tmp_path / "out"
        write_audio(str(out / "cover.jpg"))
        write_audio(str(out / "notes.txt"))
        mock_run.return_value = make_proc(returncode=0)

        with pytest.raises(Exception, match="Downloaded file not found"):
            download_with_gamdl("https://music.apple.com/x", str(out), "t1")

    @pytest.mark.parametrize("ext", [".m4a", ".mp3", ".aac", ".flac"])
    @patch("worker.jobs.download.run_subprocess")
    def test_accepts_every_supported_extension(self, mock_run, tmp_path, ext):
        out = tmp_path / "out"
        write_audio(str(out / f"song{ext}"))
        mock_run.return_value = make_proc(returncode=0)

        assert download_with_gamdl("https://music.apple.com/x", str(out), "t1").endswith(ext)

    @patch("worker.jobs.download.run_subprocess")
    def test_raises_when_the_output_directory_is_empty(self, mock_run, tmp_path):
        out = tmp_path / "out"
        out.mkdir()
        mock_run.return_value = make_proc(returncode=0)

        with pytest.raises(Exception, match="Downloaded file not found for track_id t1"):
            download_with_gamdl("https://music.apple.com/x", str(out), "t1")


class TestGamdlAlreadyExists:
    @pytest.fixture(autouse=True)
    def no_cookies(self, monkeypatch):
        monkeypatch.delenv("GAMDL_COOKIE_FILE", raising=False)

    @patch("worker.jobs.download.run_subprocess")
    def test_copies_an_existing_file_into_the_output_dir(self, mock_run, tmp_path):
        existing = write_audio(str(tmp_path / "library" / "song.m4a"))
        out = tmp_path / "out"
        out.mkdir()
        mock_run.return_value = make_proc(
            returncode=0, stderr=f"Media file already exists at '{existing}'"
        )

        result = download_with_gamdl("https://music.apple.com/x", str(out), "t1")

        assert result == str(out / "t1.m4a")
        assert os.path.exists(result)

    @patch("worker.jobs.download.run_subprocess")
    def test_falls_back_to_the_original_path_when_the_copy_fails(
        self, mock_run, tmp_path, monkeypatch
    ):
        existing = write_audio(str(tmp_path / "library" / "song.m4a"))
        out = tmp_path / "out"
        out.mkdir()
        mock_run.return_value = make_proc(
            returncode=0, stderr=f"Media file already exists at '{existing}'"
        )
        monkeypatch.setattr(
            "worker.jobs.download.shutil.copy2",
            lambda *a, **kw: (_ for _ in ()).throw(OSError("read-only fs")),
        )

        result = download_with_gamdl("https://music.apple.com/x", str(out), "t1")

        assert result == existing

    @patch("worker.jobs.download.run_subprocess")
    def test_ignores_an_already_exists_path_that_is_empty(self, mock_run, tmp_path):
        existing = write_audio(str(tmp_path / "library" / "song.m4a"), size=0)
        out = tmp_path / "out"
        write_audio(str(out / "real.m4a"))
        mock_run.return_value = make_proc(
            returncode=0, stderr=f"Media file already exists at '{existing}'"
        )

        result = download_with_gamdl("https://music.apple.com/x", str(out), "t1")

        assert result.endswith("real.m4a")


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
