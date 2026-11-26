"""Publish browser-playable FLAC without losing ALAC samples or MP4 tags."""

import base64
import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile

from mutagen.flac import FLAC, Picture
from mutagen.mp4 import MP4, MP4Cover

from .subprocess_utils import run_subprocess

# ffmpeg maps ordinary MP4 fields to Vorbis comments. Keep an exact, typed
# archive too: MP4 freeform/binary fields have no universal Vorbis equivalent.
MP4_TAG_ARCHIVE = "GROOVENET_MP4_TAGS"
TEXT_TAGS = {
    "\xa9nam": "TITLE",
    "\xa9ART": "ARTIST",
    "aART": "ALBUMARTIST",
    "\xa9alb": "ALBUM",
    "\xa9wrt": "COMPOSER",
    "\xa9lyr": "LYRICS",
    "\xa9day": "DATE",
    "\xa9gen": "GENRE",
    "\xa9cmt": "COMMENT",
    "cprt": "COPYRIGHT",
    "sonm": "TITLESORT",
    "soar": "ARTISTSORT",
    "soal": "ALBUMSORT",
    "soco": "COMPOSERSORT",
    "soaa": "ALBUMARTISTSORT",
}


def _tag_value(value):
    if isinstance(value, bytes):
        return {"base64": base64.b64encode(value).decode("ascii"), "dataformat": int(getattr(value, "dataformat", 0))}
    if isinstance(value, (list, tuple)):
        return [_tag_value(item) for item in value]
    return value


def convert_alac_to_flac(file_path: str, *, log_sink: list[str] | None = None) -> str:
    """Replace ALAC after a complete conversion; leave other codecs untouched.

    The original remains on any failure. Use a sibling temporary file so the
    finished FLAC is published atomically, including on a different /tmp mount.
    """
    source = MP4(file_path)
    if source.info.codec != "alac":
        return file_path
    target = Path(file_path).with_suffix(".flac")
    tags = source.tags or {}
    with NamedTemporaryFile(dir=target.parent, suffix=".flac", delete=False) as scratch:
        temporary = Path(scratch.name)
    try:
        result = run_subprocess(
            [
                "ffmpeg",
                "-v",
                "error",
                "-nostdin",
                "-y",
                "-i",
                file_path,
                "-map",
                "0:a:0",
                "-map_metadata",
                "0",
                "-c:a",
                "flac",
                str(temporary),
            ],
            timeout=300,
            log_sink=log_sink,
        )
        if result.returncode:
            raise RuntimeError("ALAC to FLAC conversion failed; original retained")
        output = FLAC(temporary)
        output[MP4_TAG_ARCHIVE] = json.dumps(
            {key: _tag_value(value) for key, value in tags.items() if key != "covr"}, ensure_ascii=False
        )
        for atom, comment in TEXT_TAGS.items():
            if atom in tags:
                output[comment] = tags[atom]
        # Preserve every picture byte-for-byte rather than re-encoding it.
        for index, cover in enumerate(tags.get("covr", [])):
            picture = Picture()
            picture.type = 3 if index == 0 else 0
            picture.mime = "image/png" if cover.imageformat == MP4Cover.FORMAT_PNG else "image/jpeg"
            picture.data = bytes(cover)
            output.add_picture(picture)
        output.save()
        verified = FLAC(temporary)
        if (
            verified.info.sample_rate != source.info.sample_rate
            or verified.info.bits_per_sample != source.info.bits_per_sample
            or verified.info.channels != source.info.channels
            or verified[MP4_TAG_ARCHIVE] != output[MP4_TAG_ARCHIVE]
            or [p.data for p in verified.pictures] != [bytes(c) for c in tags.get("covr", [])]
        ):
            raise RuntimeError("FLAC verification failed; original retained")
        os.replace(temporary, target)
        os.unlink(file_path)
        return str(target)
    finally:
        temporary.unlink(missing_ok=True)
