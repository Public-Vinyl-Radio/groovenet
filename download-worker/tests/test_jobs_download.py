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


@pytest.mark.parametrize(
    "job, expected",
    [
        ({"track_id": "t", "friend_id": 1, "apple_music_url": "https://music.apple.com/track"}, True),
        ({"track_id": "t", "friend_id": 1, "youtube_url": "https://youtu.be/abc"}, True),
        ({"track_id": "t", "friend_id": 1, "soundcloud_url": "https://soundcloud.com/track"}, True),
        ({"track_id": "t", "friend_id": 1}, False),
        ({"track_id": "t", "friend_id": 1, "apple_music_url": ""}, False),
        ({"track_id": "t", "friend_id": 1, "apple_music_url": "  "}, False),
        ({"track_id": "t", "friend_id": 1, "youtube_url": None}, False),
    ],
)
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
        with (
            patch("worker.jobs.download.download_with_gamdl", return_value=None),
            patch("worker.jobs.download.download_with_ytdlp", return_value=None),
        ):
            download_audio(job)
        mock_analyze.assert_not_called()


# ---------------------------------------------------------------------------
# download_audio — failure paths
# ---------------------------------------------------------------------------


def assert_status(redis, job_id, status):
    assert redis.hgetall(f"job:{job_id}")["status"] == status


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

    @patch("worker.jobs.download.download_with_gamdl", side_effect=Exception("auth failed"))
    def test_gamdl_failure_reports_outcome_after_failing(self, mock_gamdl, fake_redis, reported_outcomes):
        from worker.jobs.download import download_audio

        # The app reads the outcome from Redis, so it must be there first.
        reported_outcomes.side_effect = lambda job_id: (assert_status(fake_redis, job_id, "failed"))
        download_audio(self._job(apple_music_url="https://music.apple.com/track"))
        reported_outcomes.assert_called_once_with("job-dl-fail")

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
    @patch("groovenet_client.GroovenetClient.update_track")
    @patch("worker.jobs.download.cleanup_download_directory")
    @patch("worker.jobs.download.shutil.move")
    @patch("worker.jobs.download.download_with_gamdl", return_value="/app/downloads/track-ok.m4a")
    def test_success_path(self, mock_gamdl, mock_move, mock_cleanup, mock_patch, mock_makedirs, fake_redis):
        from worker.jobs.download import download_audio

        result = download_audio(self._job())
        assert result["success"] is True
        assert result["track_id"] == "track-ok"

    @patch("worker.jobs.download.os.makedirs")
    @patch("groovenet_client.GroovenetClient.update_track")
    @patch("worker.jobs.download.cleanup_download_directory")
    @patch("worker.jobs.download.shutil.move")
    @patch("worker.jobs.download.download_with_gamdl", return_value="/app/downloads/track-ok.m4a")
    def test_success_sets_completed_in_redis(
        self, mock_gamdl, mock_move, mock_cleanup, mock_patch, mock_makedirs, fake_redis
    ):
        from worker.jobs.download import download_audio

        download_audio(self._job())
        assert fake_redis.hgetall("job:job-dl-ok")["status"] == "completed"

    @patch("worker.jobs.download.os.makedirs")
    @patch("groovenet_client.GroovenetClient.update_track")
    @patch("worker.jobs.download.cleanup_download_directory")
    @patch("worker.jobs.download.shutil.move")
    @patch("worker.jobs.download.download_with_gamdl", return_value="/app/downloads/track-ok.m4a")
    def test_success_reports_outcome_after_completing(
        self, mock_gamdl, mock_move, mock_cleanup, mock_patch, mock_makedirs, fake_redis, reported_outcomes
    ):
        from worker.jobs.download import download_audio

        reported_outcomes.side_effect = lambda job_id: (assert_status(fake_redis, job_id, "completed"))
        download_audio(self._job())
        reported_outcomes.assert_called_once_with("job-dl-ok")

    @patch("worker.jobs.download.os.makedirs")
    @patch("groovenet_client.GroovenetClient.update_track")
    @patch("worker.jobs.download.cleanup_download_directory")
    @patch("worker.jobs.download.shutil.move")
    @patch("worker.jobs.download.download_with_gamdl", return_value="/app/downloads/track-ok.m4a")
    def test_success_enqueues_analyze_local_job(
        self, mock_gamdl, mock_move, mock_cleanup, mock_patch, mock_makedirs, fake_redis
    ):
        import json

        from worker.jobs.download import download_audio

        result = download_audio(self._job())
        assert result["analysis_status"] == "queued"
        analysis_job_id = result["analysis_job_id"]
        payload = json.loads(fake_redis.rpop("download_queue"))
        assert payload == {
            "job_id": analysis_job_id,
            "job_type": "analyze-local",
            "track_id": "track-ok",
            "friend_id": 1,
            "local_audio_url": "track-ok.m4a",
        }
        job = fake_redis.hgetall(f"job:{analysis_job_id}")
        assert job["status"] == "queued"
        assert job["job_type"] == "analyze-local"
        assert fake_redis.zscore("jobs:updated", analysis_job_id) is not None
        assert "analysis_error" not in fake_redis.hgetall("job:job-dl-ok")

    @patch("worker.jobs.download.os.makedirs")
    @patch("groovenet_client.GroovenetClient.update_track")
    @patch("worker.jobs.download.cleanup_download_directory")
    @patch("worker.jobs.download.shutil.move")
    @patch("worker.jobs.download.download_with_gamdl", return_value="/app/downloads/track-ok.m4a")
    @patch("worker.jobs.download.capture_exception")
    @patch("worker.jobs.download.enqueue_analyze_job", side_effect=RuntimeError("redis down"))
    def test_enqueue_failure_is_reported_but_download_completes(
        self, mock_enqueue, mock_capture, mock_gamdl, mock_move, mock_cleanup, mock_patch, mock_makedirs, fake_redis
    ):
        from worker.jobs.download import download_audio

        result = download_audio(self._job())
        assert result["success"] is True
        assert result["analysis_status"] == "failed"
        assert "analysis_job_id" not in result
        job = fake_redis.hgetall("job:job-dl-ok")
        assert job["status"] == "completed"
        assert job["analysis_error"] == "Failed to enqueue analysis job"
        mock_capture.assert_called_once()
        assert any(
            "Failed to enqueue analysis job: redis down" in line
            for line in fake_redis.lrange("job:job-dl-ok:logs", 0, -1)
        )


@patch("worker.jobs.download.os.makedirs")
@patch("worker.jobs.download.cleanup_download_directory")
@patch("worker.jobs.download.shutil.move")
@patch("worker.jobs.download.download_with_gamdl", return_value="/app/downloads/track-ok.m4a")
@pytest.mark.parametrize("status", [404, 500])
def test_local_url_write_failure_is_logged_but_download_is_kept(
    mock_gamdl,
    mock_move,
    mock_cleanup,
    mock_makedirs,
    status,
    fake_redis,
    caplog,
):
    import io

    import requests
    from worker.jobs.download import download_audio

    response = requests.Response()
    response.status_code = status
    response._content = b'{"error":"write rejected"}'
    response.raw = io.BytesIO(response._content)
    with patch("requests.Session.request", return_value=response) as send:
        result = download_audio(
            {
                "track_id": "track-ok",
                "friend_id": 1,
                "job_id": "job-dl-error",
                "apple_music_url": "https://music.apple.com/track/ok",
            }
        )
    assert result["success"] is True
    assert fake_redis.hgetall("job:job-dl-error")["status"] == "completed"
    assert "Failed to update local_audio_url" in caplog.text
    assert f"HTTP {status}" in caplog.text
    assert send.call_args.args[0] == "PATCH"
    assert send.call_args.kwargs["json"] == {
        "track_id": "track-ok",
        "friend_id": 1,
        "local_audio_url": "track-ok.m4a",
        "audio_source": "apple_music",
    }


@pytest.mark.parametrize("source", ["apple_music", "youtube", "soundcloud"])
@patch("worker.jobs.download.os.makedirs")
@patch("worker.jobs.download.cleanup_download_directory")
@patch("worker.jobs.download.shutil.move")
@patch("worker.jobs.download.download_with_gamdl")
@patch("worker.jobs.download.download_with_ytdlp")
@patch("groovenet_client.GroovenetClient.update_track")
def test_reports_successful_source(
    mock_update, mock_ytdlp, mock_gamdl, mock_move, mock_cleanup, mock_makedirs, source, fake_redis
):
    from worker.jobs.download import download_audio

    mock_gamdl.return_value = "/app/downloads/track.m4a" if source == "apple_music" else None
    mock_ytdlp.side_effect = (
        [None, "/app/downloads/track.m4a"] if source == "soundcloud" else ["/app/downloads/track.m4a"]
    )
    download_audio(
        {
            "track_id": "track",
            "friend_id": 1,
            "job_id": "source-test",
            "apple_music_url": "https://apple/track",
            "youtube_url": "https://youtube/track",
            "soundcloud_url": "https://soundcloud/track",
        }
    )
    mock_update.assert_called_once_with(
        {"track_id": "track", "friend_id": 1, "local_audio_url": "track.m4a", "audio_source": source}
    )


def test_flac_filename_is_published_and_queued_for_analysis(monkeypatch, fake_redis):
    from unittest.mock import Mock

    from worker.jobs import download

    client = Mock()
    monkeypatch.setattr(download.os, "makedirs", lambda *a, **k: None)
    move = Mock()
    monkeypatch.setattr(download.shutil, "move", move)
    monkeypatch.setattr(download, "download_with_gamdl", lambda *a, **k: "/app/downloads/song.flac")
    monkeypatch.setattr(download, "get_groovenet_client", lambda: client)
    monkeypatch.setattr(download, "cleanup_download_directory", lambda *a: None)
    result = download.download_audio(
        {"track_id": "flac", "friend_id": 1, "job_id": "flac-job", "apple_music_url": "https://example.invalid/song"}
    )
    assert result["local_audio_url"] == "flac.flac"
    client.update_track.assert_called_once_with(
        {"track_id": "flac", "friend_id": 1, "local_audio_url": "flac.flac", "audio_source": "apple_music"}
    )
    move.assert_called_once_with("/app/downloads/song.flac", "/app/audio/flac.flac")
    import json

    assert json.loads(fake_redis.rpop("download_queue"))["local_audio_url"] == "flac.flac"


@patch("worker.jobs.download.os.makedirs")
@patch("worker.jobs.download.cleanup_download_directory")
@patch("worker.jobs.download.download_with_gamdl")
@patch("groovenet_client.GroovenetClient.update_track")
def test_published_file_is_0644_despite_0600_source_and_umask(
    mock_update, mock_gamdl, mock_cleanup, mock_makedirs, tmp_path, fake_redis, monkeypatch
):
    import os
    import stat

    from worker.jobs import download

    source = tmp_path / "dl" / "track-perm.m4a"
    source.parent.mkdir()
    source.write_bytes(b"audio")
    source.chmod(0o600)
    final_dir = tmp_path / "audio"
    final_dir.mkdir()
    mock_gamdl.return_value = str(source)
    real_join = os.path.join
    monkeypatch.setattr(
        download.os.path, "join", lambda a, *p: real_join(str(final_dir) if a == "/app/audio" else a, *p)
    )
    old = os.umask(0o077)
    try:
        result = download.download_audio(
            {
                "track_id": "track-perm",
                "friend_id": 1,
                "job_id": "job-perm",
                "apple_music_url": "https://music.apple.com/track/perm",
            }
        )
    finally:
        os.umask(old)
    assert result["success"] is True
    assert stat.S_IMODE((final_dir / "track-perm.m4a").stat().st_mode) == 0o644


# ---------------------------------------------------------------------------
# AAC and FLAC kept side by side (#1310)
# ---------------------------------------------------------------------------


@pytest.fixture
def audio_dir(tmp_path):
    def put(name, size=10):
        (tmp_path / name).write_bytes(b"x" * size)

    return tmp_path, put


class TestPlanAudioLinks:
    def test_lossless_download_keeps_an_existing_aac(self, audio_dir):
        from worker.jobs.download import plan_audio_links

        directory, put = audio_dir
        put("t.m4a")
        assert plan_audio_links(str(directory), "t", "t.flac") == ("t.flac", "t.m4a")

    def test_lossless_download_with_no_aac_has_no_alternate(self, audio_dir):
        from worker.jobs.download import plan_audio_links

        directory, put = audio_dir
        put("t.m4a", size=0)  # an empty file is not a copy
        assert plan_audio_links(str(directory), "t", "t.flac") == ("t.flac", None)

    def test_aac_download_never_replaces_an_existing_flac(self, audio_dir):
        from worker.jobs.download import plan_audio_links

        directory, put = audio_dir
        put("t.flac")
        assert plan_audio_links(str(directory), "t", "t.m4a") == ("t.flac", "t.m4a")

    def test_lone_download_is_its_own_primary(self, audio_dir):
        from worker.jobs.download import plan_audio_links

        directory, _ = audio_dir
        assert plan_audio_links(str(directory), "t", "t.m4a") == ("t.m4a", None)


def _run_download(monkeypatch, fake_redis, filename, plan):
    from unittest.mock import Mock

    from worker.jobs import download

    client = Mock()
    monkeypatch.setattr(download.os, "makedirs", lambda *a, **k: None)
    monkeypatch.setattr(download.shutil, "move", Mock())
    monkeypatch.setattr(download, "make_library_readable", lambda *a: None)
    monkeypatch.setattr(download, "download_with_gamdl", lambda *a, **k: f"/app/downloads/{filename}")
    monkeypatch.setattr(download, "get_groovenet_client", lambda: client)
    monkeypatch.setattr(download, "cleanup_download_directory", lambda *a: None)
    monkeypatch.setattr(download, "plan_audio_links", lambda *a: plan)
    result = download.download_audio(
        {"track_id": "t", "friend_id": 1, "job_id": "alt-job", "apple_music_url": "https://example.invalid/s"}
    )
    return result, client


def test_lossless_download_links_the_existing_aac_as_an_alternate(monkeypatch, fake_redis):
    import json

    result, client = _run_download(monkeypatch, fake_redis, "song.flac", ("t.flac", "t.m4a"))
    assert result["local_audio_url"] == "t.flac"
    client.update_track.assert_called_once_with(
        {
            "track_id": "t",
            "friend_id": 1,
            "audio_source": "apple_music",
            "local_audio_url": "t.flac",
            "alternate_audio_url": "t.m4a",
        }
    )
    assert json.loads(fake_redis.rpop("download_queue"))["local_audio_url"] == "t.flac"


def test_aac_redownload_leaves_the_flac_primary_and_analyses_it(monkeypatch, fake_redis):
    import json

    result, client = _run_download(monkeypatch, fake_redis, "song.m4a", ("t.flac", "t.m4a"))
    assert result["local_audio_url"] == "t.flac"
    payload = client.update_track.call_args.args[0]
    assert "local_audio_url" not in payload
    assert payload["alternate_audio_url"] == "t.m4a"
    assert json.loads(fake_redis.rpop("download_queue"))["local_audio_url"] == "t.flac"
