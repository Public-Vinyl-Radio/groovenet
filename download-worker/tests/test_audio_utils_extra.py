"""Coverage for audio_utils paths the original suite left untested:
directory cleanup, ffprobe metadata/stream parsing, and local file fetching."""
import json
import os
import subprocess
from unittest.mock import patch

import pytest

from worker.audio_utils import (
    cleanup_download_directory,
    ensure_local_audio_file,
    extract_year_from_tag,
    get_audio_metadata_year,
    get_duration_seconds,
    get_embedded_art_stream_index,
)


def make_proc(returncode=0, stdout="", stderr=""):
    return subprocess.CompletedProcess(
        args=[], returncode=returncode, stdout=stdout, stderr=stderr
    )


def probe(**format_tags):
    return json.dumps({"format": {"tags": format_tags}})


# ---------------------------------------------------------------------------
# cleanup_download_directory
# ---------------------------------------------------------------------------

class TestCleanupDownloadDirectory:
    def test_removes_files_and_directories(self, tmp_path):
        (tmp_path / "a.m4a").write_text("x")
        nested = tmp_path / "Album"
        nested.mkdir()
        (nested / "b.m4a").write_text("y")

        cleanup_download_directory(str(tmp_path), "t1")

        assert list(tmp_path.iterdir()) == []

    def test_is_a_noop_on_an_empty_directory(self, tmp_path):
        cleanup_download_directory(str(tmp_path), "t1")

        assert list(tmp_path.iterdir()) == []

    def test_keeps_going_when_one_entry_cannot_be_removed(self, tmp_path, monkeypatch):
        (tmp_path / "a.m4a").write_text("x")
        (tmp_path / "b.m4a").write_text("y")
        failed = []

        real_unlink = os.unlink

        def flaky(path):
            if path.endswith("a.m4a"):
                failed.append(path)
                raise PermissionError("locked")
            real_unlink(path)

        monkeypatch.setattr("worker.audio_utils.os.unlink", flaky)

        cleanup_download_directory(str(tmp_path), "t1")

        # The failure is logged and skipped; the other file is still removed.
        assert failed
        assert [p.name for p in tmp_path.iterdir()] == ["a.m4a"]

    def test_raises_when_the_directory_cannot_be_listed(self, tmp_path):
        with pytest.raises(Exception):
            cleanup_download_directory(str(tmp_path / "does-not-exist"), "t1")


# ---------------------------------------------------------------------------
# extract_year_from_tag
# ---------------------------------------------------------------------------

class TestExtractYearFromTag:
    @pytest.mark.parametrize(
        "value,expected",
        [
            ("1994", 1994),
            ("1994-05-01", 1994),
            ("Released 2011 remaster", 2011),
            ("2024-01-02T03:04:05Z", 2024),
            ("1800", 1800),
            ("2100", 2100),
        ],
    )
    def test_finds_a_plausible_year(self, value, expected):
        assert extract_year_from_tag(value) == expected

    @pytest.mark.parametrize("value", ["", "   ", "no digits", "12", "123"])
    def test_returns_none_without_a_four_digit_run(self, value):
        assert extract_year_from_tag(value) is None

    @pytest.mark.parametrize("value", ["1799", "2101", "9999"])
    def test_rejects_years_outside_the_plausible_range(self, value):
        assert extract_year_from_tag(value) is None

    @pytest.mark.parametrize("value", [None, 1994, ["1994"]])
    def test_returns_none_for_a_non_string(self, value):
        assert extract_year_from_tag(value) is None

    def test_takes_the_first_plausible_run(self):
        assert extract_year_from_tag("1999 remaster of 1985") == 1999


# ---------------------------------------------------------------------------
# get_audio_metadata_year
# ---------------------------------------------------------------------------

class TestGetAudioMetadataYear:
    @patch("worker.audio_utils.run_subprocess")
    def test_returns_none_when_ffprobe_fails(self, mock_run):
        mock_run.return_value = make_proc(returncode=1, stderr="boom")

        assert get_audio_metadata_year("/a.m4a") is None

    @patch("worker.audio_utils.run_subprocess")
    def test_returns_none_on_unparseable_json(self, mock_run):
        mock_run.return_value = make_proc(stdout="{not json")

        assert get_audio_metadata_year("/a.m4a") is None

    @patch("worker.audio_utils.run_subprocess")
    def test_returns_none_when_there_are_no_tags(self, mock_run):
        mock_run.return_value = make_proc(stdout="{}")

        assert get_audio_metadata_year("/a.m4a") is None

    @pytest.mark.parametrize(
        "key", ["date", "year", "originaldate", "original_date", "release_date", "creation_time"]
    )
    @patch("worker.audio_utils.run_subprocess")
    def test_reads_each_preferred_tag(self, mock_run, key):
        mock_run.return_value = make_proc(stdout=probe(**{key: "1994-01-01"}))

        assert get_audio_metadata_year("/a.m4a") == 1994

    @patch("worker.audio_utils.run_subprocess")
    def test_prefers_date_over_a_later_key(self, mock_run):
        mock_run.return_value = make_proc(stdout=probe(date="1994", year="2007"))

        assert get_audio_metadata_year("/a.m4a") == 1994

    @patch("worker.audio_utils.run_subprocess")
    def test_falls_back_to_any_tag_carrying_a_year(self, mock_run):
        mock_run.return_value = make_proc(stdout=probe(comment="recorded in 1972"))

        assert get_audio_metadata_year("/a.m4a") == 1972

    @patch("worker.audio_utils.run_subprocess")
    def test_returns_none_when_no_tag_carries_a_year(self, mock_run):
        mock_run.return_value = make_proc(stdout=probe(artist="Someone", album="Something"))

        assert get_audio_metadata_year("/a.m4a") is None

    @pytest.mark.parametrize("tags", [["1994"], "1994", 1994])
    @patch("worker.audio_utils.run_subprocess")
    def test_returns_none_when_tags_is_not_an_object(self, mock_run, tags):
        mock_run.return_value = make_proc(stdout=json.dumps({"format": {"tags": tags}}))

        assert get_audio_metadata_year("/a.m4a") is None

    @patch("worker.audio_utils.run_subprocess")
    def test_ignores_non_string_tag_values(self, mock_run):
        mock_run.return_value = make_proc(
            stdout=json.dumps({"format": {"tags": {"date": 1994, "comment": "from 1988"}}})
        )

        assert get_audio_metadata_year("/a.m4a") == 1988


# ---------------------------------------------------------------------------
# get_duration_seconds
# ---------------------------------------------------------------------------

class TestGetDurationSeconds:
    @patch("worker.audio_utils.run_subprocess")
    def test_rounds_to_the_nearest_second(self, mock_run):
        mock_run.return_value = make_proc(stdout="212.6\n")

        assert get_duration_seconds("/a.m4a") == 213

    @patch("worker.audio_utils.run_subprocess")
    def test_raises_when_ffprobe_fails(self, mock_run):
        mock_run.return_value = make_proc(returncode=1, stderr="bad file")

        with pytest.raises(Exception, match="ffprobe failed"):
            get_duration_seconds("/a.m4a")

    @patch("worker.audio_utils.run_subprocess")
    def test_raises_on_unparseable_output(self, mock_run):
        mock_run.return_value = make_proc(stdout="N/A")

        with pytest.raises(Exception, match="duration parse failed"):
            get_duration_seconds("/a.m4a")

    @pytest.mark.parametrize("value", ["0", "0.0", "-5"])
    @patch("worker.audio_utils.run_subprocess")
    def test_rejects_a_non_positive_duration(self, mock_run, value):
        mock_run.return_value = make_proc(stdout=value)

        with pytest.raises(Exception, match="non-positive duration"):
            get_duration_seconds("/a.m4a")


# ---------------------------------------------------------------------------
# get_embedded_art_stream_index
# ---------------------------------------------------------------------------

class TestGetEmbeddedArtStreamIndex:
    @patch("worker.audio_utils.run_subprocess")
    def test_prefers_a_stream_marked_attached_pic(self, mock_run):
        mock_run.return_value = make_proc(stdout=json.dumps({"streams": [
            {"index": 0, "codec_type": "audio"},
            {"index": 2, "codec_type": "video"},
            {"index": 1, "codec_type": "video", "disposition": {"attached_pic": 1}},
        ]}))

        assert get_embedded_art_stream_index("/a.m4a") == 1

    @patch("worker.audio_utils.run_subprocess")
    def test_falls_back_to_the_first_video_stream(self, mock_run):
        mock_run.return_value = make_proc(stdout=json.dumps({"streams": [
            {"index": 0, "codec_type": "audio"},
            {"index": 3, "codec_type": "video"},
        ]}))

        assert get_embedded_art_stream_index("/a.m4a") == 3

    @patch("worker.audio_utils.run_subprocess")
    def test_returns_none_when_there_is_no_art(self, mock_run):
        mock_run.return_value = make_proc(stdout=json.dumps({"streams": [
            {"index": 0, "codec_type": "audio"},
        ]}))

        assert get_embedded_art_stream_index("/a.m4a") is None

    @patch("worker.audio_utils.run_subprocess")
    def test_returns_none_when_there_are_no_streams(self, mock_run):
        mock_run.return_value = make_proc(stdout="{}")

        assert get_embedded_art_stream_index("/a.m4a") is None

    @patch("worker.audio_utils.run_subprocess")
    def test_skips_a_stream_with_a_non_integer_index(self, mock_run):
        mock_run.return_value = make_proc(stdout=json.dumps({"streams": [
            {"index": "one", "codec_type": "video", "disposition": {"attached_pic": 1}},
            {"index": 4, "codec_type": "video"},
        ]}))

        assert get_embedded_art_stream_index("/a.m4a") == 4

    @patch("worker.audio_utils.run_subprocess")
    def test_raises_when_ffprobe_fails(self, mock_run):
        mock_run.return_value = make_proc(returncode=1, stderr="nope")

        with pytest.raises(Exception, match="stream probe failed"):
            get_embedded_art_stream_index("/a.m4a")

    @patch("worker.audio_utils.run_subprocess")
    def test_raises_on_unparseable_json(self, mock_run):
        mock_run.return_value = make_proc(stdout="{not json")

        with pytest.raises(Exception, match="json parse failed"):
            get_embedded_art_stream_index("/a.m4a")


# ---------------------------------------------------------------------------
# ensure_local_audio_file
# ---------------------------------------------------------------------------

class TestEnsureLocalAudioFile:
    def test_raises_when_the_job_has_no_local_audio_url(self):
        with pytest.raises(Exception, match="missing local_audio_url"):
            ensure_local_audio_file({"track_id": "t1", "friend_id": 1})

    def test_returns_the_path_when_it_already_exists(self, tmp_path):
        existing = tmp_path / "song.m4a"
        existing.write_text("x")

        result = ensure_local_audio_file(
            {"track_id": "t1", "friend_id": 1, "local_audio_url": str(existing)}
        )

        assert result == str(existing)

    def test_resolves_a_bare_filename_against_the_audio_dir(self, tmp_path, monkeypatch):
        audio_dir = tmp_path / "audio"
        audio_dir.mkdir()
        (audio_dir / "song.m4a").write_text("x")

        real_exists = os.path.exists

        def exists(p):
            if p == "/app/audio/song.m4a":
                return True
            return real_exists(p)

        monkeypatch.setattr("worker.audio_utils.os.path.exists", exists)

        result = ensure_local_audio_file(
            {"track_id": "t1", "friend_id": 1, "local_audio_url": "song.m4a"}
        )

        assert result == "/app/audio/song.m4a"

    def test_downloads_the_file_when_it_is_not_on_disk(self, tmp_path, monkeypatch):
        monkeypatch.setattr("worker.audio_utils.os.path.exists", lambda p: False)
        monkeypatch.setenv("APP_URL", "http://app.test:3000")
        written = tmp_path / "song.m4a"

        class Response:
            ok = True
            status_code = 200

            def iter_content(self, chunk_size):
                yield b"audio"
                yield b""
                yield b"data"

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        requested = []

        def get(url, **kw):
            requested.append(url)
            return Response()

        monkeypatch.setattr("worker.audio_utils.requests.get", get)
        # The destination is hardcoded to /tmp; shadow `open` inside the module
        # so the bytes land in tmp_path instead of the real /tmp.
        monkeypatch.setattr(
            "worker.audio_utils.open", lambda p, m: open(written, m), raising=False
        )

        log = []
        result = ensure_local_audio_file(
            {"track_id": "t1", "friend_id": 1, "local_audio_url": "/remote/song.m4a"},
            log_sink=log,
        )

        assert result == "/tmp/song.m4a"
        assert requested == ["http://app.test:3000/api/audio?filename=song.m4a"]
        assert written.read_bytes() == b"audiodata"
        assert any("Fetching audio file" in line for line in log)

    def test_raises_when_the_fetch_is_rejected(self, monkeypatch):
        monkeypatch.setattr("worker.audio_utils.os.path.exists", lambda p: False)

        class Response:
            ok = False
            status_code = 404
            text = "not found"

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        monkeypatch.setattr("worker.audio_utils.requests.get", lambda url, **kw: Response())

        with pytest.raises(Exception, match="Failed to fetch audio: 404"):
            ensure_local_audio_file(
                {"track_id": "t1", "friend_id": 1, "local_audio_url": "/remote/song.m4a"}
            )
