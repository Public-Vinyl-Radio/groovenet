from unittest.mock import patch

import pytest


class TestUpdateTrackAnalysis:
    @patch("worker.track_api.requests.patch")
    def test_updates_extracted_essentia_fields(self, mock_patch):
        from worker.track_api import update_track_analysis

        mock_patch.return_value.ok = True

        update_track_analysis(
            "track-1",
            7,
            {
                "rhythm": {"bpm": 123.6, "danceability": 0.81234},
                "tonal": {"key_edma": {"key": "C", "scale": "major"}},
                "metadata": {"audio_properties": {"length": 245.2}},
                "highlevel": {
                    "mood_happy": {"all": {"happy": 0.12345}},
                    "mood_sad": {"all": {"sad": 0.23456}},
                    "mood_relaxed": {"all": {"relaxed": 0.34567}},
                    "mood_aggressive": {"all": {"aggressive": 0.45678}},
                },
            },
            audio_year=1999,
        )

        body = mock_patch.call_args.kwargs["json"]
        assert body["bpm"] == 124
        assert body["key"] == "C major"
        assert body["danceability"] == 0.812
        assert body["duration_seconds"] == 245
        assert body["mood_happy"] == 0.123
        assert body["mood_sad"] == 0.235
        assert body["mood_relaxed"] == 0.346
        assert body["mood_aggressive"] == 0.457
        assert body["year"] == "1999"


class TestAnalyzeAudioFile:
    @patch("worker.track_api.requests.post")
    @patch("worker.track_api.run_subprocess")
    @patch("worker.track_api.os.path.getsize", return_value=100)
    @patch("worker.track_api.os.path.exists", return_value=True)
    @patch("worker.track_api.os.unlink")
    def test_raises_on_json_error_payload(
        self,
        mock_unlink,
        mock_exists,
        mock_getsize,
        mock_run,
        mock_post,
    ):
        from worker.track_api import analyze_audio_file

        mock_run.return_value.returncode = 0
        mock_run.return_value.stderr = ""
        mock_post.return_value.ok = True
        mock_post.return_value.json.return_value = {"error": "Invalid or disallowed URL"}

        with pytest.raises(Exception, match="Invalid or disallowed URL"):
            analyze_audio_file("/app/audio/track-1.m4a", "track-1", 1)


class TestAppIdentification:
    @patch("worker.track_api.requests.patch")
    def test_track_update_names_the_worker(self, mock_patch):
        from worker.track_api import update_track_analysis

        mock_patch.return_value.ok = True
        update_track_analysis("track-1", 7, {"rhythm": {"bpm": 120}})
        assert mock_patch.call_args.kwargs["headers"] == {"X-Groovenet-Client": "worker"}

    def test_generated_client_names_the_worker(self):
        from worker.track_api import get_groovenet_client

        client = get_groovenet_client().get_httpx_client()
        assert client.headers["X-Groovenet-Client"] == "worker"


class TestReportJobOutcome:
    @patch("worker.track_api.requests.post")
    def test_posts_to_the_job_outcome_route(self, mock_post, monkeypatch):
        from worker.track_api import report_job_outcome

        monkeypatch.setenv("APP_URL", "http://app.test:3000")
        mock_post.return_value.ok = True
        report_job_outcome("job-1")
        mock_post.assert_called_once_with(
            "http://app.test:3000/api/jobs/job-1/outcome",
            headers={"X-Groovenet-Client": "worker"},
            timeout=10,
        )

    @patch("worker.track_api.requests.post")
    def test_a_refused_report_is_only_logged(self, mock_post):
        from worker.track_api import report_job_outcome

        mock_post.return_value.ok = False
        mock_post.return_value.status_code = 409
        report_job_outcome("job-1")

    @patch("worker.track_api.requests.post", side_effect=ConnectionError("app down"))
    def test_an_unreachable_app_never_fails_the_job(self, mock_post):
        from worker.track_api import report_job_outcome

        report_job_outcome("job-1")
