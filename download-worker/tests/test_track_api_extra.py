"""Coverage for track_api paths the original suite left untested:
analysis-file persistence, mood extraction, the Essentia call, and the
small PATCH helpers."""
import json
import os
import subprocess
from unittest.mock import patch

import pytest
from worker import track_api
from worker.track_api import (
    _extract_highlevel_mood,
    analyze_audio_file,
    save_essentia_analysis_file,
    update_track_album_art_url,
    update_track_duration,
)


def make_proc(returncode=0, stdout="", stderr=""):
    return subprocess.CompletedProcess(
        args=[], returncode=returncode, stdout=stdout, stderr=stderr
    )


_UNSET = object()


class Response:
    def __init__(self, ok=True, status_code=200, payload=_UNSET, text=""):
        self.ok = ok
        self.status_code = status_code
        # A sentinel, not None: `payload=None` must stay None so the JSON-null
        # case reaches the code that rejects a non-object payload.
        self._payload = {} if payload is _UNSET else payload
        self.text = text

    def json(self):
        return self._payload


GOOD_ANALYSIS = {"rhythm": {"bpm": 128}, "tonal": {"key_key": "A"}}


# ---------------------------------------------------------------------------
# save_essentia_analysis_file
# ---------------------------------------------------------------------------

class TestSaveEssentiaAnalysisFile:
    @pytest.fixture(autouse=True)
    def data_dir(self, tmp_path, monkeypatch):
        monkeypatch.setattr(track_api, "ESSENTIA_DATA_DIR", str(tmp_path / "essentia"))
        return tmp_path / "essentia"

    def test_writes_the_analysis_with_its_identifiers(self, data_dir):
        path = save_essentia_analysis_file("t1", 2, {"rhythm": {"bpm": 120}})

        payload = json.loads(open(path).read())
        assert payload["track_id"] == "t1"
        assert payload["friend_id"] == 2
        assert payload["analysis"] == {"rhythm": {"bpm": 120}}
        assert isinstance(payload["saved_at"], int)

    def test_creates_the_data_directory(self, data_dir):
        assert not data_dir.exists()

        save_essentia_analysis_file("t1", 1, {})

        assert data_dir.is_dir()

    def test_names_the_file_by_track_and_friend(self, data_dir):
        path = save_essentia_analysis_file("t1", 3, {})

        assert os.path.basename(path) == "t1_3.json"

    @pytest.mark.parametrize(
        "track_id,expected",
        [
            ("abc-123", "abc-123_1.json"),
            ("a.b_c", "a.b_c_1.json"),
            ("../escape", ".._escape_1.json"),
            ("with space", "with_space_1.json"),
            ("sl/ash", "sl_ash_1.json"),
        ],
    )
    def test_sanitises_the_track_id_into_the_filename(self, data_dir, track_id, expected):
        path = save_essentia_analysis_file(track_id, 1, {})

        assert os.path.basename(path) == expected
        # A traversing id must not escape the data directory.
        assert os.path.dirname(path) == str(data_dir)

    def test_overwrites_a_previous_analysis(self, data_dir):
        save_essentia_analysis_file("t1", 1, {"v": 1})
        path = save_essentia_analysis_file("t1", 1, {"v": 2})

        assert json.loads(open(path).read())["analysis"] == {"v": 2}


# ---------------------------------------------------------------------------
# _extract_highlevel_mood
# ---------------------------------------------------------------------------

class TestExtractHighlevelMood:
    def test_reads_and_rounds_a_value(self):
        data = {"mood_happy": {"all": {"happy": 0.123456}}}

        assert _extract_highlevel_mood(data, "mood_happy", "happy") == 0.123

    def test_accepts_an_integer_value(self):
        data = {"mood_happy": {"all": {"happy": 1}}}

        assert _extract_highlevel_mood(data, "mood_happy", "happy") == 1.0

    def test_returns_none_for_a_missing_section(self):
        assert _extract_highlevel_mood({}, "mood_happy", "happy") is None

    @pytest.mark.parametrize("section", ["not-a-dict", 5, ["x"], None])
    def test_returns_none_when_the_section_is_not_an_object(self, section):
        data = {"mood_happy": section}

        assert _extract_highlevel_mood(data, "mood_happy", "happy") is None

    @pytest.mark.parametrize("all_value", ["x", 5, ["x"], None])
    def test_returns_none_when_all_is_not_an_object(self, all_value):
        data = {"mood_happy": {"all": all_value}}

        assert _extract_highlevel_mood(data, "mood_happy", "happy") is None

    def test_returns_none_for_a_missing_key(self):
        data = {"mood_happy": {"all": {}}}

        assert _extract_highlevel_mood(data, "mood_happy", "happy") is None

    @pytest.mark.parametrize("value", ["0.5", None, ["0.5"], {}])
    def test_returns_none_for_a_non_numeric_value(self, value):
        data = {"mood_happy": {"all": {"happy": value}}}

        assert _extract_highlevel_mood(data, "mood_happy", "happy") is None


# ---------------------------------------------------------------------------
# analyze_audio_file
# ---------------------------------------------------------------------------

class TestAnalyzeAudioFile:
    @pytest.fixture(autouse=True)
    def isolate(self, tmp_path, monkeypatch):
        """Keep the WAV inside tmp_path and stub the collaborators."""
        audio_dir = tmp_path / "audio"
        audio_dir.mkdir()
        monkeypatch.setenv("AUDIO_DIR", str(audio_dir))
        monkeypatch.setattr(track_api, "ESSENTIA_DATA_DIR", str(tmp_path / "essentia"))
        monkeypatch.setattr(track_api, "update_track_analysis", lambda *a, **kw: None)
        monkeypatch.setattr(track_api, "get_audio_metadata_year", lambda *a, **kw: 1994)

    def _wav_making_run(self, tmp_path, returncode=0, stderr="", size=64):
        """Stand in for ffmpeg by creating the WAV it would have written."""
        def run(cmd, **kw):
            if returncode == 0:
                wav_path = cmd[-1]
                with open(wav_path, "wb") as f:
                    f.write(b"\0" * size)
            return make_proc(returncode=returncode, stderr=stderr)
        return run

    @patch("worker.track_api.requests.post")
    @patch("worker.track_api.run_subprocess")
    def test_returns_the_analysis_on_success(self, mock_run, mock_post, tmp_path):
        mock_run.side_effect = self._wav_making_run(tmp_path)
        mock_post.return_value = Response(payload=GOOD_ANALYSIS)

        result = analyze_audio_file(str(tmp_path / "song.m4a"), "t1", 1)

        assert result == GOOD_ANALYSIS

    @patch("worker.track_api.requests.post")
    @patch("worker.track_api.run_subprocess")
    def test_persists_the_analysis_json(self, mock_run, mock_post, tmp_path):
        mock_run.side_effect = self._wav_making_run(tmp_path)
        mock_post.return_value = Response(payload=GOOD_ANALYSIS)

        analyze_audio_file(str(tmp_path / "song.m4a"), "t1", 1)

        saved = tmp_path / "essentia" / "t1_1.json"
        assert json.loads(saved.read_text())["analysis"] == GOOD_ANALYSIS

    @patch("worker.track_api.requests.post")
    @patch("worker.track_api.run_subprocess")
    def test_a_failed_save_does_not_fail_the_analysis(
        self, mock_run, mock_post, tmp_path, monkeypatch
    ):
        mock_run.side_effect = self._wav_making_run(tmp_path)
        mock_post.return_value = Response(payload=GOOD_ANALYSIS)
        monkeypatch.setattr(
            track_api,
            "save_essentia_analysis_file",
            lambda *a, **kw: (_ for _ in ()).throw(OSError("read-only")),
        )

        assert analyze_audio_file(str(tmp_path / "song.m4a"), "t1", 1) == GOOD_ANALYSIS

    @patch("worker.track_api.requests.post")
    @patch("worker.track_api.run_subprocess")
    def test_honours_ESSENTIA_API_URL(self, mock_run, mock_post, tmp_path, monkeypatch):
        monkeypatch.setenv("ESSENTIA_API_URL", "http://elsewhere:9000/go")
        mock_run.side_effect = self._wav_making_run(tmp_path)
        mock_post.return_value = Response(payload=GOOD_ANALYSIS)

        analyze_audio_file(str(tmp_path / "song.m4a"), "t1", 1)

        assert mock_post.call_args[0][0] == "http://elsewhere:9000/go"

    @patch("worker.track_api.requests.post")
    @patch("worker.track_api.run_subprocess")
    def test_appends_to_the_log_sink(self, mock_run, mock_post, tmp_path):
        mock_run.side_effect = self._wav_making_run(tmp_path)
        mock_post.return_value = Response(payload=GOOD_ANALYSIS)
        log = []

        analyze_audio_file(str(tmp_path / "song.m4a"), "t1", 1, log_sink=log)

        assert any("Calling Essentia" in line for line in log)

    @patch("worker.track_api.run_subprocess")
    def test_raises_when_ffmpeg_fails(self, mock_run, tmp_path):
        mock_run.side_effect = self._wav_making_run(tmp_path, returncode=1, stderr="bad codec")

        with pytest.raises(Exception, match="FFmpeg conversion failed"):
            analyze_audio_file(str(tmp_path / "song.m4a"), "t1", 1)

    @patch("worker.track_api.run_subprocess")
    def test_raises_when_the_wav_is_empty(self, mock_run, tmp_path):
        mock_run.side_effect = self._wav_making_run(tmp_path, size=0)

        with pytest.raises(Exception, match="empty file"):
            analyze_audio_file(str(tmp_path / "song.m4a"), "t1", 1)

    @patch("worker.track_api.requests.post")
    @patch("worker.track_api.run_subprocess")
    def test_raises_on_an_essentia_http_error(self, mock_run, mock_post, tmp_path):
        mock_run.side_effect = self._wav_making_run(tmp_path)
        mock_post.return_value = Response(ok=False, status_code=503, text="down")

        with pytest.raises(Exception, match="Essentia API error: 503"):
            analyze_audio_file(str(tmp_path / "song.m4a"), "t1", 1)

    @pytest.mark.parametrize("payload", [["a"], "text", 5, None])
    @patch("worker.track_api.requests.post")
    @patch("worker.track_api.run_subprocess")
    def test_raises_on_a_non_object_payload(self, mock_run, mock_post, tmp_path, payload):
        mock_run.side_effect = self._wav_making_run(tmp_path)
        mock_post.return_value = Response(payload=payload)

        with pytest.raises(Exception, match="unexpected payload"):
            analyze_audio_file(str(tmp_path / "song.m4a"), "t1", 1)

    @pytest.mark.parametrize("key", ["error", "detail"])
    @patch("worker.track_api.requests.post")
    @patch("worker.track_api.run_subprocess")
    def test_raises_on_a_200_with_an_error_payload(self, mock_run, mock_post, tmp_path, key):
        """Older Essentia builds return 200 with an error body."""
        mock_run.side_effect = self._wav_making_run(tmp_path)
        mock_post.return_value = Response(payload={key: "could not decode"})

        with pytest.raises(Exception, match="could not decode"):
            analyze_audio_file(str(tmp_path / "song.m4a"), "t1", 1)

    @patch("worker.track_api.requests.post")
    @patch("worker.track_api.run_subprocess")
    def test_raises_when_no_analysis_fields_are_present(self, mock_run, mock_post, tmp_path):
        mock_run.side_effect = self._wav_making_run(tmp_path)
        mock_post.return_value = Response(payload={"something": "else"})

        with pytest.raises(Exception, match="no analysis fields"):
            analyze_audio_file(str(tmp_path / "song.m4a"), "t1", 1)

    @pytest.mark.parametrize("field", ["rhythm", "tonal", "metadata"])
    @patch("worker.track_api.requests.post")
    @patch("worker.track_api.run_subprocess")
    def test_accepts_any_single_analysis_field(self, mock_run, mock_post, tmp_path, field):
        mock_run.side_effect = self._wav_making_run(tmp_path)
        mock_post.return_value = Response(payload={field: {}})

        assert analyze_audio_file(str(tmp_path / "song.m4a"), "t1", 1) == {field: {}}

    @patch("worker.track_api.requests.post")
    @patch("worker.track_api.run_subprocess")
    def test_removes_the_temporary_wav_on_success(self, mock_run, mock_post, tmp_path):
        created = []

        def run(cmd, **kw):
            wav_path = cmd[-1]
            created.append(wav_path)
            with open(wav_path, "wb") as f:
                f.write(b"\0" * 64)
            return make_proc()

        mock_run.side_effect = run
        mock_post.return_value = Response(payload=GOOD_ANALYSIS)

        analyze_audio_file(str(tmp_path / "song.m4a"), "t1", 1)

        assert created and not os.path.exists(created[0])

    @patch("worker.track_api.requests.post")
    @patch("worker.track_api.run_subprocess")
    def test_removes_the_temporary_wav_on_failure(self, mock_run, mock_post, tmp_path):
        created = []

        def run(cmd, **kw):
            wav_path = cmd[-1]
            created.append(wav_path)
            with open(wav_path, "wb") as f:
                f.write(b"\0" * 64)
            return make_proc()

        mock_run.side_effect = run
        mock_post.return_value = Response(ok=False, status_code=500, text="boom")

        with pytest.raises(Exception):
            analyze_audio_file(str(tmp_path / "song.m4a"), "t1", 1)

        assert created and not os.path.exists(created[0])


# ---------------------------------------------------------------------------
# update_track_duration / update_track_album_art_url
# ---------------------------------------------------------------------------

class TestSmallPatchHelpers:
    @patch("worker.track_api.patch_api_tracks.sync")
    @patch("worker.track_api.get_groovenet_client")
    def test_update_track_duration_sends_the_value(self, mock_client, mock_sync):
        mock_sync.return_value = {"ok": True}

        update_track_duration("t1", 2, 213)

        body = mock_sync.call_args.kwargs["body"]
        assert body.track_id == "t1"
        assert body.friend_id == 2
        assert body["duration_seconds"] == 213

    @patch("worker.track_api.patch_api_tracks.sync")
    @patch("worker.track_api.get_groovenet_client")
    def test_update_track_duration_raises_on_no_response(self, mock_client, mock_sync):
        mock_sync.return_value = None

        with pytest.raises(Exception, match="Failed to update duration for track t1"):
            update_track_duration("t1", 2, 213)

    @patch("worker.track_api.patch_api_tracks.sync")
    @patch("worker.track_api.get_groovenet_client")
    def test_update_track_album_art_url_sends_the_value(self, mock_client, mock_sync):
        mock_sync.return_value = {"ok": True}

        update_track_album_art_url("t1", 2, "https://art.test/a.jpg")

        body = mock_sync.call_args.kwargs["body"]
        assert body.track_id == "t1"
        assert body["audio_file_album_art_url"] == "https://art.test/a.jpg"

    @patch("worker.track_api.patch_api_tracks.sync")
    @patch("worker.track_api.get_groovenet_client")
    def test_update_track_album_art_url_raises_on_no_response(self, mock_client, mock_sync):
        mock_sync.return_value = None

        with pytest.raises(Exception, match="Failed to update album art url for track t1"):
            update_track_album_art_url("t1", 2, "https://art.test/a.jpg")
