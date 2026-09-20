"""Tests for fix_duration, analyze_local_audio, and cover art job handlers."""
import subprocess
from unittest.mock import MagicMock, patch


def make_proc(returncode=0, stdout="", stderr=""):
    return subprocess.CompletedProcess(args=[], returncode=returncode, stdout=stdout, stderr=stderr)


# ---------------------------------------------------------------------------
# fix_duration
# ---------------------------------------------------------------------------

class TestFixDuration:
    def _job(self, **kwargs):
        return {
            "track_id": "track-abc",
            "friend_id": 1,
            "job_id": "job-dur-1",
            "local_audio_url": "/app/audio/track-abc.m4a",
            **kwargs,
        }

    @patch("worker.jobs.duration.update_track_duration")
    @patch("worker.jobs.duration.get_duration_seconds", return_value=240)
    @patch("worker.jobs.duration.ensure_local_audio_file", return_value="/app/audio/track-abc.m4a")
    def test_success_path(self, mock_ensure, mock_duration, mock_update, fake_redis):
        from worker.jobs.duration import fix_duration
        result = fix_duration(self._job())

        assert result["success"] is True
        assert result["duration_seconds"] == 240
        assert result["track_id"] == "track-abc"
        mock_update.assert_called_once_with("track-abc", 1, 240)

    @patch("worker.jobs.duration.update_track_duration")
    @patch("worker.jobs.duration.get_duration_seconds", return_value=240)
    @patch("worker.jobs.duration.ensure_local_audio_file", return_value="/app/audio/track-abc.m4a")
    def test_success_sets_completed_in_redis(self, mock_ensure, mock_duration, mock_update, fake_redis):
        from worker.jobs.duration import fix_duration
        fix_duration(self._job())
        data = fake_redis.hgetall("job:job-dur-1")
        assert data["status"] == "completed"
        assert data["progress"] == "100"

    @patch("worker.jobs.duration.ensure_local_audio_file", side_effect=Exception("file not found"))
    def test_failure_path_returns_error(self, mock_ensure, fake_redis):
        from worker.jobs.duration import fix_duration
        result = fix_duration(self._job())
        assert result["success"] is False
        assert "file not found" in result["error"]

    @patch("worker.jobs.duration.ensure_local_audio_file", side_effect=Exception("file not found"))
    def test_failure_sets_failed_in_redis(self, mock_ensure, fake_redis):
        from worker.jobs.duration import fix_duration
        fix_duration(self._job())
        data = fake_redis.hgetall("job:job-dur-1")
        assert data["status"] == "failed"

    @patch("worker.jobs.duration.ensure_local_audio_file", side_effect=Exception("fail"))
    def test_failure_stores_logs(self, mock_ensure, fake_redis):
        from worker.jobs.duration import fix_duration
        fix_duration(self._job())
        logs = fake_redis.lrange("job:job-dur-1:logs", 0, -1)
        assert any("fail" in line for line in logs)


# ---------------------------------------------------------------------------
# analyze_local_audio
# ---------------------------------------------------------------------------

class TestAnalyzeLocalAudio:
    def _job(self, **kwargs):
        return {
            "track_id": "track-xyz",
            "friend_id": 2,
            "job_id": "job-analyze-1",
            "local_audio_url": "/app/audio/track-xyz.m4a",
            **kwargs,
        }

    @patch("worker.jobs.analyze.analyze_audio_file", return_value={"rhythm": {"bpm": 128}})
    @patch("worker.jobs.analyze.ensure_local_audio_file", return_value="/app/audio/track-xyz.m4a")
    def test_success_path(self, mock_ensure, mock_analyze, fake_redis):
        from worker.jobs.analyze import analyze_local_audio
        result = analyze_local_audio(self._job())
        assert result["success"] is True
        assert result["analysis"] == {"rhythm": {"bpm": 128}}

    @patch("worker.jobs.analyze.analyze_audio_file", return_value={"rhythm": {}})
    @patch("worker.jobs.analyze.ensure_local_audio_file", return_value="/app/audio/track-xyz.m4a")
    def test_success_sets_completed_in_redis(self, mock_ensure, mock_analyze, fake_redis):
        from worker.jobs.analyze import analyze_local_audio
        analyze_local_audio(self._job())
        assert fake_redis.hgetall("job:job-analyze-1")["status"] == "completed"

    @patch("worker.jobs.analyze.ensure_local_audio_file", side_effect=Exception("no audio"))
    def test_failure_path(self, mock_ensure, fake_redis):
        from worker.jobs.analyze import analyze_local_audio
        result = analyze_local_audio(self._job())
        assert result["success"] is False
        assert "no audio" in result["error"]
        assert fake_redis.hgetall("job:job-analyze-1")["status"] == "failed"


# ---------------------------------------------------------------------------
# extract_embedded_cover_art
# ---------------------------------------------------------------------------

class TestExtractEmbeddedCoverArt:
    def _job(self, **kwargs):
        return {
            "track_id": "track-cover",
            "friend_id": 3,
            "job_id": "job-cover-1",
            "local_audio_url": "/app/audio/track-cover.m4a",
            **kwargs,
        }

    @patch("worker.jobs.cover_art.update_track_album_art_url")
    @patch("worker.jobs.cover_art.run_subprocess")
    @patch("worker.jobs.cover_art.get_embedded_art_stream_index", return_value=0)
    @patch("worker.jobs.cover_art.ensure_local_audio_file", return_value="/app/audio/track-cover.m4a")
    def test_success_path(self, mock_ensure, mock_index, mock_run, mock_update, fake_redis, tmp_path, monkeypatch):
        monkeypatch.setattr("worker.jobs.cover_art.os.makedirs", lambda *a, **kw: None)
        mock_run.return_value = make_proc(returncode=0)

        from worker.jobs.cover_art import extract_embedded_cover_art
        result = extract_embedded_cover_art(self._job())

        assert result["success"] is True
        assert "audio_file_album_art_url" in result
        mock_update.assert_called_once()

    @patch("worker.jobs.cover_art.get_embedded_art_stream_index", return_value=None)
    @patch("worker.jobs.cover_art.ensure_local_audio_file", return_value="/app/audio/track-cover.m4a")
    def test_no_art_stream_fails(self, mock_ensure, mock_index, fake_redis):
        from worker.jobs.cover_art import extract_embedded_cover_art
        result = extract_embedded_cover_art(self._job())
        assert result["success"] is False
        assert "No embedded cover art" in result["error"]

    @patch("worker.jobs.cover_art.ensure_local_audio_file", side_effect=Exception("file missing"))
    def test_ensure_failure_propagates(self, mock_ensure, fake_redis):
        from worker.jobs.cover_art import extract_embedded_cover_art
        result = extract_embedded_cover_art(self._job())
        assert result["success"] is False
        assert fake_redis.hgetall("job:job-cover-1")["status"] == "failed"


# ---------------------------------------------------------------------------
# extract_embedded_cover_art_album
# ---------------------------------------------------------------------------

class TestExtractEmbeddedCoverArtAlbum:
    def _job(self, **kwargs):
        return {
            "track_id": "track-alb",
            "friend_id": 4,
            "job_id": "job-album-cover-1",
            "release_id": "release-99",
            **kwargs,
        }

    @patch("worker.jobs.cover_art.requests.post")
    def test_success_path(self, mock_post, fake_redis):
        mock_post.return_value = MagicMock(ok=True, json=lambda: {"extracted": 5})
        from worker.jobs.cover_art import extract_embedded_cover_art_album
        result = extract_embedded_cover_art_album(self._job())
        assert result["success"] is True
        assert result["extracted"] == 5

    def test_missing_release_id_fails(self, fake_redis):
        job = {"track_id": "t", "friend_id": 1, "job_id": "job-album-cover-2"}
        from worker.jobs.cover_art import extract_embedded_cover_art_album
        result = extract_embedded_cover_art_album(job)
        assert result["success"] is False
        assert "release_id" in result["error"]

    @patch("worker.jobs.cover_art.requests.post")
    def test_api_error_fails(self, mock_post, fake_redis):
        mock_post.return_value = MagicMock(ok=False, status_code=500, text="Server error")
        from worker.jobs.cover_art import extract_embedded_cover_art_album
        result = extract_embedded_cover_art_album(self._job())
        assert result["success"] is False
        assert fake_redis.hgetall("job:job-album-cover-1")["status"] == "failed"
