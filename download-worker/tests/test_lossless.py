"""Generated audio only: no Apple data, network or credentials."""

import base64
import hashlib
import json
import shutil
import subprocess
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from mutagen.flac import FLAC
from mutagen.mp4 import MP4, MP4Cover, MP4FreeForm
from worker import lossless

pytestmark = pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg required")
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)


def ffmpeg(*args):
    return subprocess.run(["ffmpeg", "-v", "error", "-nostdin", *map(str, args)], capture_output=True, check=True)


@pytest.fixture
def alac(tmp_path):
    path = tmp_path / "source.m4a"
    ffmpeg(
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=96000:duration=2",
        "-c:a",
        "alac",
        "-sample_fmt",
        "s32p",
        path,
    )
    media = MP4(path)
    media.tags.update(
        {
            "\xa9nam": ["Generated song"],
            "\xa9ART": ["Artist A", "Artist B"],
            "\xa9alb": ["Generated album"],
            "\xa9wrt": ["Composer"],
            "\xa9lyr": ["Synthetic lyrics\nSecond line"],
            "\xa9day": ["2026"],
            "trkn": [(2, 12)],
            "disk": [(1, 2)],
            "cpil": True,
            "tmpo": [120],
            "----:com.apple.iTunes:ISRC": [MP4FreeForm(b"TEST12345678")],
            "----:example:binary": [MP4FreeForm(b"\x00\xff")],
            "covr": [MP4Cover(PNG, imageformat=MP4Cover.FORMAT_PNG)],
        }
    )
    media.save()
    return path


def pcm_md5(path):
    return hashlib.md5(ffmpeg("-i", path, "-f", "s32le", "-c:a", "pcm_s32le", "-").stdout).hexdigest()


def test_bit_exact_24_96_tags_and_cover(alac):
    original = MP4(alac)
    original_hash = pcm_md5(alac)
    source_hash = hashlib.sha256(alac.read_bytes()).hexdigest()
    output = Path(lossless.convert_alac_to_flac(str(alac)))
    media = FLAC(output)
    assert not alac.exists()
    assert output.suffix == ".flac"
    assert pcm_md5(output) == original_hash
    assert (media.info.bits_per_sample, media.info.sample_rate) == (24, 96000)
    assert media["title"] == ["Generated song"]
    assert media["artist"] == ["Artist A", "Artist B"]
    assert media["album"] == ["Generated album"]
    assert media.pictures[0].data == PNG
    assert media.pictures[0].mime == "image/png"
    assert json.loads(media[lossless.MP4_TAG_ARCHIVE][0]) == {
        key: lossless._tag_value(value) for key, value in original.tags.items() if key != "covr"
    }
    assert hashlib.sha256(output.read_bytes()).hexdigest() != source_hash
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(output)],
        capture_output=True,
        text=True,
        check=True,
    )
    stream = json.loads(probe.stdout)["streams"][0]
    assert (stream["codec_name"], stream["bits_per_raw_sample"], stream["sample_rate"]) == ("flac", "24", "96000")


def test_aac_is_unchanged(tmp_path):
    path = tmp_path / "aac.m4a"
    ffmpeg("-f", "lavfi", "-i", "sine=duration=0.1", "-c:a", "aac", path)
    before = path.read_bytes()
    assert lossless.convert_alac_to_flac(str(path)) == str(path)
    assert path.read_bytes() == before


def test_without_tags_or_art(alac):
    media = MP4(alac)
    media.delete()
    output = FLAC(lossless.convert_alac_to_flac(str(alac)))
    assert json.loads(output[lossless.MP4_TAG_ARCHIVE][0]) == {}
    assert output.pictures == []


def test_multiple_covers_preserve_order_and_mime(alac):
    media = MP4(alac)
    media["covr"] = [
        MP4Cover(PNG, imageformat=MP4Cover.FORMAT_PNG),
        MP4Cover(b"jpeg", imageformat=MP4Cover.FORMAT_JPEG),
    ]
    media.save()
    output = FLAC(lossless.convert_alac_to_flac(str(alac)))
    assert [(p.type, p.mime, p.data) for p in output.pictures] == [(3, "image/png", PNG), (0, "image/jpeg", b"jpeg")]


@pytest.mark.parametrize(
    "failure", ["exit", "raise", "sample_rate", "bits_per_sample", "channels", "archive", "pictures", "save"]
)
def test_failure_retains_original_and_cleans_scratch(alac, monkeypatch, failure):
    original = alac.read_bytes()
    if failure == "exit":
        monkeypatch.setattr(lossless, "run_subprocess", lambda *a, **k: SimpleNamespace(returncode=1))
    elif failure == "raise":
        monkeypatch.setattr(lossless, "run_subprocess", Mock(side_effect=TimeoutError))
    elif failure == "save":
        monkeypatch.setattr(FLAC, "save", Mock(side_effect=OSError("disk full")))
    else:
        real = lossless.FLAC
        count = 0

        def corrupt(path):
            nonlocal count
            count += 1
            obj = real(path)
            if count == 2:
                if failure == "archive":
                    obj[lossless.MP4_TAG_ARCHIVE] = "broken"
                elif failure == "pictures":
                    obj.clear_pictures()
                else:
                    setattr(obj.info, failure, getattr(obj.info, failure) + 1)
            return obj

        monkeypatch.setattr(lossless, "FLAC", corrupt)
    with pytest.raises((RuntimeError, TimeoutError, OSError)):
        lossless.convert_alac_to_flac(str(alac))
    assert alac.read_bytes() == original
    assert list(alac.parent.iterdir()) == [alac]


@pytest.mark.parametrize("cap,expected", [(44100, 44100), (48000, 48000), (96000, 96000), (192000, 96000)])
def test_sample_rate_cap(alac, cap, expected):
    output = FLAC(lossless.convert_alac_to_flac(str(alac), sample_rate_cap=cap))
    assert output.info.sample_rate == expected
    assert output.info.bits_per_sample == 24


def test_invalid_cap_keeps_original(alac):
    with pytest.raises(ValueError, match="sample-rate cap"):
        lossless.convert_alac_to_flac(str(alac), sample_rate_cap=12345)
    assert alac.exists()


def test_flac_output_is_world_readable_under_restrictive_umask(alac):
    import os
    import stat

    old = os.umask(0o077)
    try:
        output = lossless.convert_alac_to_flac(str(alac))
    finally:
        os.umask(old)
    assert stat.S_IMODE(Path(output).stat().st_mode) == 0o644
