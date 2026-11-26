"""Tests for the gamdl 4 Python API port in download.py.

gamdl itself is replaced at the module boundary (AppleMusicApi, WrapperApi,
Drm, Downloader, MediaResolver), so these run with no network or cookies.
"""

import asyncio
import os
from pathlib import Path
from types import SimpleNamespace

import pytest
from gamdl.api import GamdlApiResponseError, GamdlAuthenticationError, GamdlRateLimitError
from gamdl.drm import DrmConfigurationError, DrmLicenseError
from gamdl.exceptions import GamdlError
from gamdl.media import SongCodec
from gamdl.media.exceptions import MediaNotFoundError, MediaNotStreamableError, UnsupportedMediaError
from worker.jobs import download
from worker.jobs.download import (
    DEFAULT_CODEC_PRIORITY,
    LOSSLESS_CODEC_PRIORITY,
    GamdlOutcome,
    WrapperSignInRequired,
    check_url_mismatch,
    describe_gamdl_error,
    download_with_gamdl,
    expected_apple_music_ids,
    gamdl_codec_priority,
    gamdl_wrapper_url,
    run_gamdl,
    usable_gamdl_cookie_file,
)

ALBUM_URL = "https://music.apple.com/us/album/radio-activity-remastered/700049905"
TRACK_URL = f"{ALBUM_URL}?i=700050141"


def write_audio(path, size=1024):
    """Create a non-empty file; gamdl discovery skips zero-byte files."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(b"\0" * size)
    return str(path)


@pytest.fixture
def env(monkeypatch):
    for name in ("GAMDL_WRAPPER_URL", "GAMDL_COOKIE_FILE"):
        monkeypatch.delenv(name, raising=False)
    return monkeypatch


@pytest.fixture
def cookies(env, tmp_path):
    path = tmp_path / "cookies.txt"
    path.write_text(".music.apple.com\tTRUE\t/\tTRUE\t1999999999\tmedia-user-token\tx\n")
    env.setenv("GAMDL_COOKIE_FILE", str(path))
    return str(path)


# ---------------------------------------------------------------------------
# Quality and wrapper mapping
# ---------------------------------------------------------------------------


class TestCodecPriority:
    @pytest.mark.parametrize("quality", ["best", "high", "standard", "128k"])
    def test_non_lossless_settings_get_hls_aac(self, env, quality):
        env.setenv("GAMDL_WRAPPER_URL", "http://gamdl-wrapper:8080")
        assert gamdl_codec_priority(quality) == ("aac",)

    def test_lossless_without_a_wrapper_falls_back_to_aac(self, env):
        assert gamdl_codec_priority("lossless") == DEFAULT_CODEC_PRIORITY

    def test_lossless_with_a_wrapper_prefers_alac_then_aac(self, env):
        env.setenv("GAMDL_WRAPPER_URL", "http://gamdl-wrapper:8080")
        assert gamdl_codec_priority("lossless") == ("alac-lossless", "aac")

    def test_every_codec_is_one_gamdl_knows(self):
        for codec in (*DEFAULT_CODEC_PRIORITY, *LOSSLESS_CODEC_PRIORITY):
            SongCodec(codec)


class TestWrapperUrl:
    def test_unset_is_none(self, env):
        assert gamdl_wrapper_url() is None

    def test_blank_counts_as_unset(self, env):
        env.setenv("GAMDL_WRAPPER_URL", "   ")
        assert gamdl_wrapper_url() is None

    def test_strips_whitespace(self, env):
        env.setenv("GAMDL_WRAPPER_URL", " http://gamdl-wrapper:8080 ")
        assert gamdl_wrapper_url() == "http://gamdl-wrapper:8080"


# ---------------------------------------------------------------------------
# Cookie validation
# ---------------------------------------------------------------------------


class TestUsableCookieFile:
    def test_accepts_a_file_with_apple_entries(self, cookies):
        assert usable_gamdl_cookie_file() == cookies

    def test_none_when_nothing_is_configured(self, env, monkeypatch):
        monkeypatch.setattr(download, "resolve_gamdl_cookie_file", lambda: None)
        assert usable_gamdl_cookie_file() is None

    def test_none_when_the_file_is_missing(self, env, tmp_path):
        env.setenv("GAMDL_COOKIE_FILE", str(tmp_path / "absent.txt"))
        env.setattr(download, "resolve_gamdl_cookie_file", lambda: str(tmp_path / "absent.txt"))
        assert usable_gamdl_cookie_file() is None

    def test_none_when_the_file_is_empty(self, env, tmp_path):
        path = tmp_path / "cookies.txt"
        path.write_text("   ")
        env.setenv("GAMDL_COOKIE_FILE", str(path))
        assert usable_gamdl_cookie_file() is None

    def test_none_without_apple_entries(self, env, tmp_path):
        path = tmp_path / "cookies.txt"
        path.write_text("some.other.domain\tvalue")
        env.setenv("GAMDL_COOKIE_FILE", str(path))
        assert usable_gamdl_cookie_file() is None

    def test_none_when_the_file_cannot_be_read(self, env, tmp_path):
        path = tmp_path / "cookies-dir"
        path.mkdir()
        env.setenv("GAMDL_COOKIE_FILE", str(path))
        assert usable_gamdl_cookie_file() is None


# ---------------------------------------------------------------------------
# Error messages
# ---------------------------------------------------------------------------


class TestDescribeGamdlError:
    @pytest.mark.parametrize(
        "error,expected",
        [
            (WrapperSignInRequired("Wrapper v2 is signed out"), "Wrapper v2 is signed out"),
            (GamdlAuthenticationError("rejected"), "Authentication failed - cookie file may be expired or invalid"),
            (GamdlRateLimitError(), "Rate limited by Apple Music - please try again later"),
            (MediaNotFoundError("gone"), "Track not found on Apple Music"),
            (GamdlApiResponseError("nope", status_code=404), "Track not found on Apple Music"),
            (UnsupportedMediaError("Invalid or unsupported Apple Music URL"), "Unsupported Apple Music URL"),
            (MediaNotStreamableError("no playParams"), "Track not available in your region"),
            (DrmConfigurationError("Widevine backend not installed"), "Decryption backend unavailable"),
            (GamdlApiResponseError("boom", status_code=500), "gamdl failed: GamdlApiResponseError: boom"),
            (GamdlError("odd"), "gamdl failed: GamdlError: odd"),
        ],
    )
    def test_maps_each_error_class(self, error, expected):
        assert describe_gamdl_error(error).startswith(expected)

    @pytest.mark.parametrize("error", [MediaNotStreamableError("x"), DrmLicenseError("x")])
    def test_unconfirmed_subscription_explains_playback_failures(self, error):
        assert describe_gamdl_error(error, subscription_confirmed=False) == "Apple Music subscription required"

    def test_unconfirmed_subscription_does_not_hide_other_errors(self):
        message = describe_gamdl_error(GamdlRateLimitError(), subscription_confirmed=False)
        assert message.startswith("Rate limited")


# ---------------------------------------------------------------------------
# URL mismatch guard
# ---------------------------------------------------------------------------


class TestExpectedIds:
    @pytest.mark.parametrize(
        "url,expected",
        [
            (TRACK_URL, ("700050141", "700049905")),
            ("https://music.apple.com/us/song/intermission/700050141", ("700050141", None)),
            ("https://music.apple.com/us/playlist/x/pl.0123456789abcdef0123456789abcdef?i=5", ("5", None)),
            (ALBUM_URL, (None, None)),
            ("https://www.youtube.com/watch?v=x", (None, None)),
        ],
    )
    def test_reads_song_and_album_ids(self, url, expected):
        assert expected_apple_music_ids(url) == expected


class TestCheckUrlMismatch:
    def _check(self, url, outcome):
        lines: list[str] = []
        check_url_mismatch(url, [outcome], lines.append)
        return lines

    def test_quiet_when_the_catalog_matches(self):
        outcome = GamdlOutcome("700050141", "downloaded", "/x.m4a", "700050141", ("700049905",))
        assert self._check(TRACK_URL, outcome) == []

    def test_flags_a_different_song(self):
        outcome = GamdlOutcome("700050141", "downloaded", "/x.m4a", "999", ("700049905",))
        (line,) = self._check(TRACK_URL, outcome)
        assert line == f"URL MISMATCH: Expected {TRACK_URL}, gamdl processed song 999"

    def test_flags_a_song_from_another_album(self):
        url = f"{ALBUM_URL}?i=726155181"
        outcome = GamdlOutcome("726155181", "downloaded", "/x.m4a", "726155181", ("726154713",))
        (line,) = self._check(url, outcome)
        assert "from album 726154713" in line

    def test_falls_back_to_the_requested_id_without_catalog_metadata(self):
        outcome = GamdlOutcome("700050141", "downloaded", "/x.m4a")
        assert self._check(TRACK_URL, outcome) == []

    def test_album_urls_are_not_checked(self):
        outcome = GamdlOutcome("1", "downloaded", "/x.m4a", "1")
        assert self._check(ALBUM_URL, outcome) == []


# ---------------------------------------------------------------------------
# run_gamdl, against fakes of gamdl's API
# ---------------------------------------------------------------------------


class FakeContext:
    def __init__(self, **attrs):
        self.__dict__.update(attrs)
        self.closed = False

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        self.closed = True
        return False


class FakeMedia:
    def __init__(self, media_id, *, album="700049905", metadata_error=None):
        self.id = media_id
        self.album = album
        self.metadata_error = metadata_error

    async def get_metadata(self):
        if self.metadata_error:
            raise self.metadata_error
        return {"id": self.id, "relationships": {"albums": {"data": [{"id": self.album}, {}]}}}


def result(media, status="downloaded", path="/out/a.m4a", codec=SongCodec.AAC):
    return SimpleNamespace(media_id=media.id, status=SimpleNamespace(value=status), path=Path(path), codec=codec)


class FakeGamdl:
    """Installs fakes for gamdl's API in worker.jobs.download and records calls."""

    def __init__(self, monkeypatch, *, subscription=True):
        self.media: list[FakeMedia] = []
        self.outcomes: dict[str, object] = {}
        self.resolve_error: Exception | None = None
        self.calls: dict[str, object] = {}
        self.api = FakeContext(active_subscription=subscription)
        self.wrapper = FakeContext()
        fake = self

        async def from_cookies(path):
            fake.calls["cookies"] = path
            return fake.api

        async def from_wrapper(wrapper):
            fake.calls["from_wrapper"] = wrapper
            return fake.api

        async def create(**kwargs):
            fake.calls["wrapper"] = kwargs
            return fake.wrapper

        class Downloader:
            def __init__(self, **kwargs):
                fake.calls["downloader"] = kwargs

            async def download(self, media, *, codec_priority):
                fake.calls.setdefault("codecs", codec_priority)
                outcome = fake.outcomes.get(media.id, "downloaded")
                if isinstance(outcome, Exception):
                    raise outcome
                if isinstance(outcome, str):
                    return result(media, path=f"/out/{media.id}.m4a")
                return outcome

        class MediaResolver:
            def __init__(self, api):
                assert api is fake.api

            async def from_url(self, url):
                fake.calls["url"] = url
                if fake.resolve_error:
                    raise fake.resolve_error
                for media in fake.media:
                    yield media

        monkeypatch.setattr(
            download, "AppleMusicApi", SimpleNamespace(from_cookies=from_cookies, from_wrapper=from_wrapper)
        )
        monkeypatch.setattr(download, "check_wrapper_ready", lambda url: None)
        monkeypatch.setattr(download, "WrapperApi", SimpleNamespace(create=create))
        monkeypatch.setattr(download, "Drm", SimpleNamespace(from_widevine=lambda api: ("widevine", api)))
        monkeypatch.setattr(download, "Downloader", Downloader)
        monkeypatch.setattr(download, "MediaResolver", MediaResolver)

    def run(self, url=TRACK_URL, *, codecs=("aac",), cookie_file="/c.txt", wrapper_url=None):
        lines: list[str] = []
        outcomes = asyncio.run(
            run_gamdl(url, "/out", codecs, cookie_file=cookie_file, wrapper_url=wrapper_url, log=lines.append)
        )
        return outcomes, lines


@pytest.fixture
def gamdl(monkeypatch):
    return FakeGamdl(monkeypatch)


class TestRunGamdl:
    def test_downloads_with_cookies_and_widevine(self, gamdl):
        gamdl.media = [FakeMedia("700050141")]

        outcomes, lines = gamdl.run()

        assert outcomes == [GamdlOutcome("700050141", "downloaded", "/out/700050141.m4a", "700050141", ("700049905",))]
        assert gamdl.calls["cookies"] == "/c.txt"
        assert gamdl.calls["downloader"]["drm"] == ("widevine", gamdl.api)
        assert gamdl.calls["downloader"]["wrapper_api"] is None
        assert gamdl.calls["downloader"]["path_formatter"].output_dir == Path("/out")
        assert gamdl.calls["codecs"] == [SongCodec.AAC]
        assert lines == ["gamdl downloaded 700050141 (aac): /out/700050141.m4a"]
        assert gamdl.api.closed

    def test_wrapper_auth_never_prompts_for_a_login(self, gamdl):
        gamdl.media = [FakeMedia("1")]

        gamdl.run(codecs=LOSSLESS_CODEC_PRIORITY, cookie_file=None, wrapper_url="http://gamdl-wrapper:8080")

        kwargs = gamdl.calls["wrapper"]
        assert kwargs["base_url"] == "http://gamdl-wrapper:8080"
        assert gamdl.calls["from_wrapper"] is gamdl.wrapper
        assert gamdl.calls["downloader"]["wrapper_api"] is gamdl.wrapper
        assert gamdl.calls["codecs"] == [SongCodec.ALAC_LOSSLESS, SongCodec.AAC]
        with pytest.raises(WrapperSignInRequired):
            asyncio.run(kwargs["get_credentials"]())
        with pytest.raises(WrapperSignInRequired):
            asyncio.run(kwargs["get_2fa_code"]())

    def test_reports_an_already_existing_file(self, gamdl):
        media = FakeMedia("1")
        gamdl.media = [media]
        gamdl.outcomes["1"] = result(media, status="skipped", path="/out/old.m4a", codec=None)

        outcomes, lines = gamdl.run()

        assert outcomes[0].status == "skipped"
        assert lines == ["gamdl skipped 1 (existing file): /out/old.m4a"]

    def test_an_unavailable_album_track_is_skipped_not_fatal(self, gamdl):
        gamdl.media = [FakeMedia("1"), FakeMedia("2")]
        gamdl.outcomes["1"] = MediaNotFoundError("Media is unavailable in this storefront: 1")

        outcomes, lines = gamdl.run(ALBUM_URL)

        assert [o.media_id for o in outcomes] == ["2"]
        assert lines[0] == "gamdl skipped 1: Media is unavailable in this storefront: 1"

    def test_raises_the_skip_reason_when_nothing_was_published(self, gamdl):
        gamdl.media = [FakeMedia("1")]
        gamdl.outcomes["1"] = MediaNotStreamableError("no playParams")

        with pytest.raises(Exception, match="^Track not available in your region$") as exc:
            gamdl.run()

        assert isinstance(exc.value.__cause__, MediaNotStreamableError)

    def test_other_errors_stop_the_run(self, gamdl):
        gamdl.media = [FakeMedia("1"), FakeMedia("2")]
        gamdl.outcomes["1"] = DrmLicenseError("no key")

        with pytest.raises(Exception, match="gamdl failed: DrmLicenseError: no key"):
            gamdl.run(ALBUM_URL)

        assert "codecs" in gamdl.calls

    def test_auth_failure_is_mapped(self, gamdl, monkeypatch):
        async def rejected(path):
            raise GamdlAuthenticationError("Apple Music media-user-token cookie is missing")

        monkeypatch.setattr(download.AppleMusicApi, "from_cookies", rejected)

        with pytest.raises(Exception, match="Authentication failed - cookie file may be expired or invalid"):
            gamdl.run()

    def test_resolver_errors_are_mapped(self, gamdl):
        gamdl.resolve_error = GamdlApiResponseError("missing", status_code=404)

        with pytest.raises(Exception, match="Track not found on Apple Music"):
            gamdl.run(ALBUM_URL)

    def test_unconfirmed_subscription_is_logged_and_explains_failures(self, monkeypatch):
        gamdl = FakeGamdl(monkeypatch, subscription=False)
        gamdl.media = [FakeMedia("1")]
        gamdl.outcomes["1"] = MediaNotStreamableError("no playParams")

        with pytest.raises(Exception, match="^Apple Music subscription required$"):
            gamdl.run()

    def test_metadata_failure_after_download_keeps_the_file(self, gamdl):
        gamdl.media = [FakeMedia("1", metadata_error=GamdlError("metadata"))]

        outcomes, _ = gamdl.run()

        assert outcomes == [GamdlOutcome("1", "downloaded", "/out/1.m4a")]


# ---------------------------------------------------------------------------
# download_with_gamdl, with run_gamdl replaced
# ---------------------------------------------------------------------------


class StubRun:
    """Stands in for run_gamdl: optionally writes files, then returns outcomes."""

    def __init__(self, outcomes=(), *, error=None, before=None, delay=0):
        self.outcomes = list(outcomes)
        self.error = error
        self.before = before
        self.delay = delay
        self.kwargs = None

    async def __call__(self, url, output_dir, codec_priority, *, cookie_file, wrapper_url, log, sample_rate_cap=48000):
        self.kwargs = dict(
            url=url,
            output_dir=output_dir,
            codec_priority=codec_priority,
            cookie_file=cookie_file,
            wrapper_url=wrapper_url,
        )
        if self.before:
            self.before()
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.error:
            raise self.error
        log("stub ran")
        return self.outcomes


@pytest.fixture
def stub(monkeypatch):
    def install(*args, **kwargs):
        fake = StubRun(*args, **kwargs)
        monkeypatch.setattr(download, "run_gamdl", fake)
        return fake

    return install


class TestDownloadWithGamdl:
    def test_returns_the_published_file_and_logs_to_the_job(self, cookies, stub, tmp_path):
        out = tmp_path / "out"
        path = write_audio(out / "Kraftwerk" / "Album" / "05 Intermission.m4a")
        run = stub([GamdlOutcome("700050141", "downloaded", path, "700050141", ("700049905",))])
        sink: list[str] = []

        assert download_with_gamdl(TRACK_URL, str(out), "t1", log_sink=sink) == path
        assert run.kwargs == dict(
            url=TRACK_URL, output_dir=str(out), codec_priority=("aac",), cookie_file=cookies, wrapper_url=None
        )
        assert sink == [f"gamdl {TRACK_URL} (codecs: aac, auth: cookies)", "stub ran"]

    def test_picks_the_largest_track_of_an_album(self, cookies, stub, tmp_path):
        small = write_audio(tmp_path / "a.m4a", size=10)
        large = write_audio(tmp_path / "b.m4a", size=5000)
        stub([GamdlOutcome("1", "downloaded", small), GamdlOutcome("2", "overwritten", large)])

        assert download_with_gamdl(ALBUM_URL, str(tmp_path), "t1") == large

    def test_lossless_with_a_wrapper_signs_in_through_it(self, env, stub, tmp_path):
        env.setenv("GAMDL_WRAPPER_URL", "http://gamdl-wrapper:8080")
        path = write_audio(tmp_path / "a.m4a")
        run = stub([GamdlOutcome("1", "downloaded", path)])

        download_with_gamdl(TRACK_URL, str(tmp_path), "t1", job_data={"track_id": "t1", "quality": "lossless"})

        assert run.kwargs["codec_priority"] == ("alac-lossless", "aac")
        assert run.kwargs["wrapper_url"] == "http://gamdl-wrapper:8080"
        assert run.kwargs["cookie_file"] is None

    def test_aac_keeps_using_cookies_when_a_wrapper_is_configured(self, cookies, env, stub, tmp_path):
        env.setenv("GAMDL_WRAPPER_URL", "http://gamdl-wrapper:8080")
        run = stub([GamdlOutcome("1", "downloaded", write_audio(tmp_path / "a.m4a"))])

        download_with_gamdl(TRACK_URL, str(tmp_path), "t1", job_data={"track_id": "t1", "quality": "best"})

        assert run.kwargs["wrapper_url"] is None
        assert run.kwargs["cookie_file"] == cookies

    def test_fails_clearly_without_a_usable_cookie_file(self, env, stub, tmp_path, monkeypatch):
        monkeypatch.setattr(download, "resolve_gamdl_cookie_file", lambda: None)
        run = stub()

        with pytest.raises(Exception, match="^gamdl error: Authentication failed - no usable Apple Music cookie file$"):
            download_with_gamdl(TRACK_URL, str(tmp_path), "t1")

        assert run.kwargs is None

    def test_copies_an_already_existing_file_to_the_track_id(self, cookies, stub, tmp_path):
        existing = write_audio(tmp_path / "Kraftwerk" / "Album" / "05 Intermission.m4a")
        stub([GamdlOutcome("1", "skipped", existing)])

        result = download_with_gamdl(TRACK_URL, str(tmp_path), "t1")

        assert result == str(tmp_path / "t1.m4a")
        assert os.path.getsize(result) == 1024

    def test_uses_the_existing_path_when_the_copy_fails(self, cookies, stub, tmp_path, monkeypatch):
        existing = write_audio(tmp_path / "Album" / "song.m4a")
        stub([GamdlOutcome("1", "skipped", existing)])

        def fail(*args, **kwargs):
            raise OSError("read-only fs")

        monkeypatch.setattr(download.shutil, "copy2", fail)

        assert download_with_gamdl(TRACK_URL, str(tmp_path), "t1") == existing

    def test_ignores_an_existing_path_that_is_empty(self, cookies, stub, tmp_path):
        empty = write_audio(tmp_path / "lib" / "song.m4a", size=0)
        real = write_audio(tmp_path / "out" / "real.m4a")
        stub([GamdlOutcome("1", "skipped", empty), GamdlOutcome("2", "downloaded", real)])

        assert download_with_gamdl(ALBUM_URL, str(tmp_path / "out"), "t1") == real

    def test_falls_back_to_the_directory_diff(self, cookies, stub, tmp_path):
        out = tmp_path / "out"
        out.mkdir()
        stub([], before=lambda: write_audio(out / "Album" / "Disc 1" / "track.m4a"))

        assert download_with_gamdl(TRACK_URL, str(out), "t1").endswith("track.m4a")

    def test_diff_accepts_a_new_top_level_audio_file(self, cookies, stub, tmp_path):
        out = tmp_path / "out"
        out.mkdir()
        stub([], before=lambda: (write_audio(out / "song.flac"), write_audio(out / "cover.jpg")))

        assert download_with_gamdl(TRACK_URL, str(out), "t1").endswith("song.flac")

    def test_searches_the_whole_directory_when_nothing_is_new(self, cookies, stub, tmp_path):
        out = tmp_path / "out"
        write_audio(out / "Album" / "old.m4a")
        stub([])

        assert download_with_gamdl(TRACK_URL, str(out), "t1").endswith("old.m4a")

    @pytest.mark.parametrize("name,size", [("empty.m4a", 0), ("notes.txt", 10)])
    def test_raises_when_no_audio_was_produced(self, cookies, stub, tmp_path, name, size):
        out = tmp_path / "out"
        write_audio(out / name, size=size)
        stub([GamdlOutcome("1", "downloaded", str(out / "gone.m4a"))])

        with pytest.raises(Exception, match="Downloaded file not found for track_id t1"):
            download_with_gamdl(TRACK_URL, str(out), "t1")

    def test_tolerates_an_output_dir_that_cannot_be_listed(self, cookies, stub, tmp_path):
        stub([])

        with pytest.raises(Exception, match="Downloaded file not found"):
            download_with_gamdl(TRACK_URL, str(tmp_path / "missing"), "t1")

    def test_logs_a_url_mismatch_to_the_job(self, cookies, stub, tmp_path):
        path = write_audio(tmp_path / "a.m4a")
        stub([GamdlOutcome("700050141", "downloaded", path, "999")])
        sink: list[str] = []

        assert download_with_gamdl(TRACK_URL, str(tmp_path), "t1", log_sink=sink) == path
        assert sink[-1] == f"URL MISMATCH: Expected {TRACK_URL}, gamdl processed song 999"

    def test_a_timeout_becomes_a_clear_message(self, cookies, stub, tmp_path, monkeypatch):
        monkeypatch.setattr(download, "GAMDL_TIMEOUT_SECONDS", 0.01)
        stub(delay=1)

        with pytest.raises(Exception, match="^Download timeout \\(10 minutes\\)"):
            download_with_gamdl(TRACK_URL, str(tmp_path), "t1")

    def test_prefixes_errors_once(self, cookies, stub, tmp_path):
        stub(error=Exception("Track not found on Apple Music"))

        with pytest.raises(Exception, match="^gamdl error: Track not found on Apple Music$"):
            download_with_gamdl(TRACK_URL, str(tmp_path), "t1")

    def test_does_not_double_prefix(self, cookies, stub, tmp_path):
        stub(error=Exception("gamdl error: already tagged"))

        with pytest.raises(Exception) as exc:
            download_with_gamdl(TRACK_URL, str(tmp_path), "t1")

        assert str(exc.value).count("gamdl error:") == 1


def test_find_audio_files_respects_max_depth(tmp_path):
    write_audio(tmp_path / "a" / "b" / "deep.m4a")
    found: list[str] = []

    download._find_audio_files(str(tmp_path), found, max_depth=0, current_depth=1)

    assert found == []


def test_find_audio_files_tolerates_an_unreadable_directory(tmp_path):
    found: list[str] = []

    download._find_audio_files(str(tmp_path / "missing"), found)

    assert found == []


@pytest.mark.parametrize(
    "codec,wrapper", [(SongCodec.ALAC_LOSSLESS, None), (SongCodec.ALAC_HIRES, None), (None, "http://stub")]
)
def test_run_converts_downloaded_or_cached_alac(gamdl, monkeypatch, codec, wrapper):
    media = FakeMedia("1")
    gamdl.media = [media]
    gamdl.outcomes["1"] = result(media, codec=codec)
    calls = []

    def convert(path, *, sample_rate_cap):
        assert sample_rate_cap == 48000
        calls.append(path)
        return "/out/a.flac"

    monkeypatch.setattr(download, "convert_alac_to_flac", convert)
    outcomes, _ = gamdl.run(wrapper_url=wrapper)
    assert outcomes[0].path == "/out/a.flac"
    assert calls == ["/out/a.m4a"]


def test_hires_cap_requests_hires_then_lossless(cookies, stub, tmp_path):
    path = write_audio(tmp_path / "x.m4a")
    run = stub([GamdlOutcome("1", "downloaded", path)])
    from unittest.mock import patch

    with patch.dict(os.environ, {"GAMDL_WRAPPER_URL": "http://stub"}):
        assert (
            download_with_gamdl(TRACK_URL, str(tmp_path), "1", {"quality": "lossless", "sample_rate_cap": 96000})
            == path
        )
    assert run.kwargs["codec_priority"] == ("alac-hires", "alac-lossless", "aac")


@pytest.mark.parametrize("fallback", [True, False])
def test_failed_lossless_aac_retry_is_opt_out(cookies, tmp_path, monkeypatch, fallback):
    path = write_audio(tmp_path / "aac.m4a")
    calls = []

    async def run(url, output_dir, codec_priority, **kwargs):
        calls.append(codec_priority)
        if codec_priority != ("aac",):
            raise Exception("Wrapper v2 is signed out")
        return [GamdlOutcome("1", "downloaded", path)]

    monkeypatch.setattr(download, "run_gamdl", run)
    monkeypatch.setenv("GAMDL_WRAPPER_URL", "http://stub")
    logs = []
    if fallback:
        assert download_with_gamdl(TRACK_URL, str(tmp_path), "1", {"quality": "lossless"}, logs) == path
        assert calls == [LOSSLESS_CODEC_PRIORITY, DEFAULT_CODEC_PRIORITY]
        assert any("retrying as AAC" in line for line in logs)
    else:
        with pytest.raises(Exception, match="signed out"):
            download_with_gamdl(
                TRACK_URL, str(tmp_path), "1", {"quality": "lossless", "lossless_fallback": False}, logs
            )
        assert calls == [LOSSLESS_CODEC_PRIORITY]


@pytest.mark.parametrize("kind", ["private-error", "signed-out"])
def test_wrapper_session_setup_never_exposes_token_response(gamdl, monkeypatch, kind):
    async def fail(wrapper):
        if kind == "signed-out":
            raise WrapperSignInRequired("Wrapper v2 is signed out")
        raise GamdlApiResponseError("synthetic-private-token-response")

    monkeypatch.setattr(download.AppleMusicApi, "from_wrapper", fail)
    with pytest.raises(Exception) as caught:
        gamdl.run(wrapper_url="http://stub")
    assert "synthetic-private-token-response" not in str(caught.value)
    assert "Wrapper v2" in str(caught.value)
