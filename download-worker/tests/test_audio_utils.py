import subprocess
from unittest.mock import MagicMock, patch

import pytest
from worker.audio_utils import (
    ensure_local_audio_file,
    extract_year_from_tag,
    get_audio_metadata_year,
    get_duration_seconds,
)

# ---------------------------------------------------------------------------
# extract_year_from_tag — pure function
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("value, expected", [
    ("2021", 2021),
    ("2021-07-04", 2021),
    ("Recorded in 1999", 1999),
    ("01/15/2003", 2003),
    ("no year here", None),
    ("", None),
    ("1799", None),          # before lower bound
    ("2101", None),          # after upper bound
    ("abcd", None),          # digits but not a valid year
])
def test_extract_year_from_tag(value, expected):
    assert extract_year_from_tag(value) == expected


def test_extract_year_from_tag_non_string_returns_none():
    assert extract_year_from_tag(None) is None  # type: ignore[arg-type]
    assert extract_year_from_tag(2021) is None  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# get_duration_seconds
# ---------------------------------------------------------------------------

def make_proc(returncode=0, stdout="", stderr=""):
    return subprocess.CompletedProcess(args=[], returncode=returncode, stdout=stdout, stderr=stderr)


@patch("worker.audio_utils.run_subprocess")
def test_get_duration_seconds_success(mock_run):
    mock_run.return_value = make_proc(stdout="183.456\n")
    assert get_duration_seconds("/audio/track.m4a") == 183


@patch("worker.audio_utils.run_subprocess")
def test_get_duration_seconds_rounds(mock_run):
    mock_run.return_value = make_proc(stdout="60.6\n")
    assert get_duration_seconds("/audio/track.m4a") == 61


@patch("worker.audio_utils.run_subprocess")
def test_get_duration_seconds_nonzero_exit_raises(mock_run):
    mock_run.return_value = make_proc(returncode=1, stderr="file not found")
    with pytest.raises(Exception, match="ffprobe failed"):
        get_duration_seconds("/audio/missing.m4a")


@patch("worker.audio_utils.run_subprocess")
def test_get_duration_seconds_bad_output_raises(mock_run):
    mock_run.return_value = make_proc(stdout="not-a-number\n")
    with pytest.raises(Exception, match="parse failed"):
        get_duration_seconds("/audio/track.m4a")


@patch("worker.audio_utils.run_subprocess")
def test_get_duration_seconds_populates_log_sink(mock_run):
    mock_run.return_value = make_proc(stdout="120.0\n")
    sink: list[str] = []
    get_duration_seconds("/audio/track.m4a", log_sink=sink)
    mock_run.assert_called_once()
    _, kwargs = mock_run.call_args
    assert kwargs.get("log_sink") is sink


# ---------------------------------------------------------------------------
# get_audio_metadata_year
# ---------------------------------------------------------------------------

@patch("worker.audio_utils.run_subprocess")
def test_get_audio_metadata_year_from_date_tag(mock_run):
    mock_run.return_value = make_proc(
        stdout='{"format": {"tags": {"date": "1997-06-17"}}}'
    )
    assert get_audio_metadata_year("/audio/track.m4a") == 1997


@patch("worker.audio_utils.run_subprocess")
def test_get_audio_metadata_year_returns_none_on_failure(mock_run):
    mock_run.return_value = make_proc(returncode=1)
    assert get_audio_metadata_year("/audio/track.m4a") is None


@patch("worker.audio_utils.run_subprocess")
def test_get_audio_metadata_year_returns_none_when_no_year(mock_run):
    mock_run.return_value = make_proc(stdout='{"format": {"tags": {"title": "No Year"}}}')
    assert get_audio_metadata_year("/audio/track.m4a") is None


# ---------------------------------------------------------------------------
# ensure_local_audio_file
# ---------------------------------------------------------------------------

def test_ensure_local_audio_file_returns_existing_path(tmp_path):
    f = tmp_path / "track.m4a"
    f.write_bytes(b"audio")
    result = ensure_local_audio_file({"track_id": "t1", "friend_id": 1, "local_audio_url": str(f)})
    assert result == str(f)


def test_ensure_local_audio_file_resolves_audio_dir(monkeypatch):
    # Simulate: full path doesn't exist, but /app/audio/<filename> does
    candidate = "/app/audio/track.m4a"
    monkeypatch.setattr(
        "worker.audio_utils.os.path.exists",
        lambda p: p == candidate,
    )
    result = ensure_local_audio_file(
        {"track_id": "t1", "friend_id": 1, "local_audio_url": "track.m4a"},
    )
    assert result == candidate


def test_ensure_local_audio_file_raises_when_no_url():
    with pytest.raises(Exception, match="missing local_audio_url"):
        ensure_local_audio_file({"track_id": "t1", "friend_id": 1})


@patch("worker.audio_utils.requests.get")
def test_ensure_local_audio_file_downloads_fallback(mock_get, tmp_path):
    mock_response = MagicMock()
    mock_response.ok = True
    mock_response.iter_content.return_value = [b"audio-data"]
    mock_response.__enter__ = lambda s: s
    mock_response.__exit__ = MagicMock(return_value=False)
    mock_get.return_value = mock_response

    with patch("worker.audio_utils.os.path.exists", return_value=False):
        result = ensure_local_audio_file(
            {"track_id": "t1", "friend_id": 1, "local_audio_url": "track.m4a"},
        )
    assert result == "/tmp/track.m4a"
