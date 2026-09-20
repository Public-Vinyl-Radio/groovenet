"""Tests for the download job handler and its helpers."""
import subprocess
from unittest.mock import patch

import pytest
from worker.jobs.download import has_download_urls


def make_proc(returncode=0, stdout="", stderr=""):
    return subprocess.CompletedProcess(args=[], returncode=returncode, stdout=stdout, stderr=stderr)


# ---------------------------------------------------------------------------
# has_download_urls
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("job, expected", [
    ({"track_id": "t", "friend_id": 1, "apple_music_url": "https://music.apple.com/track"}, True),
    ({"track_id": "t", "friend_id": 1, "youtube_url": "https://youtu.be/abc"}, True),
    ({"track_id": "t", "friend_id": 1, "soundcloud_url": "https://soundcloud.com/track"}, True),
    ({"track_id": "t", "friend_id": 1}, False),
    ({"track_id": "t", "friend_id": 1, "apple_music_url": ""}, False),
    ({"track_id": "t", "friend_id": 1, "apple_music_url": "  "}, False),
    ({"track_id": "t", "friend_id": 1, "youtube_url": None}, False),
])
def test_has_download_urls(job, expected):
    assert has_download_urls(job) == expected


# ---------------------------------------------------------------------------
# download_audio — routing logic
# ---------------------------------------------------------------------------

class TestDownloadAudioRouting:
    def _base_job(self, **kwargs):
        return {
            "track_id": "track-1",
            "friend_id": 1,
            "job_id": "job-dl-1",
            **kwargs,
        }

    @patch("worker.jobs.download.analyze_local_audio")
    def test_routes_to_analyze_when_only_local_audio_url(self, mock_analyze, fake_redis):
        mock_analyze.return_value = {"success": True, "track_id": "track-1", "friend_id": 1}
        from worker.jobs.download import download_audio
        job = self._base_job(local_audio_url="/app/audio/track-1.m4a")
        download_audio(job)
        mock_analyze.assert_called_once_with(job)

    @patch("worker.jobs.download.analyze_local_audio")
    def test_does_not_reroute_when_remote_url_present(self, mock_analyze, fake_redis):
        """If both local_audio_url and a remote URL exist, do the download (not analyze)."""
        from worker.jobs.download import download_audio
        job = self._base_job(
            local_audio_url="/app/audio/track-1.m4a",
            apple_music_url="https://music.apple.com/track",
        )
        with patch("worker.jobs.download.download_with_gamdl", return_value=None), \
             patch("worker.jobs.download.download_with_ytdlp", return_value=None):
            download_audio(job)
        mock_analyze.assert_not_called()


# ---------------------------------------------------------------------------
# download_audio — failure paths
# ---------------------------------------------------------------------------

class TestDownloadAudioFailure:
    def _job(self, **kwargs):
        return {
            "track_id": "track-fail",
            "friend_id": 1,
            "job_id": "job-dl-fail",
            **kwargs,
        }

    @patch("worker.jobs.download.download_with_gamdl", side_effect=Exception("auth failed"))
    def test_gamdl_failure_returns_error(self, mock_gamdl, fake_redis):
        from worker.jobs.download import download_audio
        result = download_audio(self._job(apple_music_url="https://music.apple.com/track"))
        assert result["success"] is False
        assert "failed" in result["error"].lower()

    @patch("worker.jobs.download.download_with_gamdl", side_effect=Exception("auth failed"))
    def test_gamdl_failure_sets_failed_in_redis(self, mock_gamdl, fake_redis):
        from worker.jobs.download import download_audio
        download_audio(self._job(apple_music_url="https://music.apple.com/track"))
        assert fake_redis.hgetall("job:job-dl-fail")["status"] == "failed"

    @patch("worker.jobs.download.download_with_gamdl", side_effect=Exception("auth failed"))
    def test_gamdl_failure_stores_logs(self, mock_gamdl, fake_redis):
        from worker.jobs.download import download_audio
        download_audio(self._job(apple_music_url="https://music.apple.com/track"))
        logs = fake_redis.lrange("job:job-dl-fail:logs", 0, -1)
        assert len(logs) > 0

    def test_no_urls_at_all_returns_error(self, fake_redis):
        from worker.jobs.download import download_audio
        result = download_audio(self._job())
        assert result["success"] is False


# ---------------------------------------------------------------------------
# download_audio — success path
# ---------------------------------------------------------------------------

class TestDownloadAudioSuccess:
    def _job(self, **kwargs):
        return {
            "track_id": "track-ok",
            "friend_id": 1,
            "job_id": "job-dl-ok",
            "apple_music_url": "https://music.apple.com/track/ok",
            **kwargs,
        }

    # os.makedirs is mocked because /app/* doesn't exist outside Docker
    @patch("worker.jobs.download.os.makedirs")
    @patch("worker.jobs.download.analyze_audio_file", return_value={"rhythm": {"bpm": 120}})
    @patch("worker.jobs.download.patch_api_tracks.sync")
    @patch("worker.jobs.download.cleanup_download_directory")
    @patch("worker.jobs.download.shutil.move")
    @patch("worker.jobs.download.download_with_gamdl", return_value="/app/downloads/track-ok.m4a")
    def test_success_path(self, mock_gamdl, mock_move, mock_cleanup, mock_patch, mock_analyze, mock_makedirs, fake_redis):
        from worker.jobs.download import download_audio
        result = download_audio(self._job())
        assert result["success"] is True
        assert result["track_id"] == "track-ok"

    @patch("worker.jobs.download.os.makedirs")
    @patch("worker.jobs.download.analyze_audio_file", return_value={"rhythm": {"bpm": 120}})
    @patch("worker.jobs.download.patch_api_tracks.sync")
    @patch("worker.jobs.download.cleanup_download_directory")
    @patch("worker.jobs.download.shutil.move")
    @patch("worker.jobs.download.download_with_gamdl", return_value="/app/downloads/track-ok.m4a")
    def test_success_sets_completed_in_redis(self, mock_gamdl, mock_move, mock_cleanup, mock_patch, mock_analyze, mock_makedirs, fake_redis):
        from worker.jobs.download import download_audio
        download_audio(self._job())
        assert fake_redis.hgetall("job:job-dl-ok")["status"] == "completed"

    @patch("worker.jobs.download.os.makedirs")
    @patch("worker.jobs.download.analyze_audio_file", side_effect=Exception("essentia down"))
    @patch("worker.jobs.download.patch_api_tracks.sync")
    @patch("worker.jobs.download.cleanup_download_directory")
    @patch("worker.jobs.download.shutil.move")
    @patch("worker.jobs.download.download_with_gamdl", return_value="/app/downloads/track-ok.m4a")
    def test_analysis_failure_does_not_fail_job(self, mock_gamdl, mock_move, mock_cleanup, mock_patch, mock_analyze, mock_makedirs, fake_redis):
        """Download succeeds even if Essentia analysis fails."""
        from worker.jobs.download import download_audio
        result = download_audio(self._job())
        assert result["success"] is True
        assert fake_redis.hgetall("job:job-dl-ok")["status"] == "completed"


# ---------------------------------------------------------------------------
# download_with_gamdl — error classification
# ---------------------------------------------------------------------------

class TestDownloadWithGamdl:
    @patch("worker.jobs.download.run_subprocess")
    def test_auth_error_raises_clear_message(self, mock_run):
        mock_run.return_value = make_proc(returncode=1, stderr="Unauthorized 401")
        from worker.jobs.download import download_with_gamdl
        with pytest.raises(Exception, match="Authentication failed"):
            download_with_gamdl("https://music.apple.com/track", "/app/downloads", "t1")

    @patch("worker.jobs.download.run_subprocess")
    def test_not_found_error(self, mock_run):
        mock_run.return_value = make_proc(returncode=1, stderr="404 not found")
        from worker.jobs.download import download_with_gamdl
        with pytest.raises(Exception, match="not found on Apple Music"):
            download_with_gamdl("https://music.apple.com/track", "/app/downloads", "t1")

    @patch("worker.jobs.download.run_subprocess")
    def test_rate_limit_error(self, mock_run):
        mock_run.return_value = make_proc(returncode=1, stderr="rate limit exceeded")
        from worker.jobs.download import download_with_gamdl
        with pytest.raises(Exception, match="Rate limited"):
            download_with_gamdl("https://music.apple.com/track", "/app/downloads", "t1")
