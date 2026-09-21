"""Fill the in-memory reference index from the app's REST API (#278).

This service holds no database connection — that was the point of splitting it
out (#273) — so the stored fingerprints come over HTTP, in pages, and are
rebuilt into a `ReferenceIndex` here. #271 measured the whole library at ~28 MB
of postings rebuilding in 2.3 s, which is cheap enough that persisting the
index would buy nothing but a cache to invalidate.

The blobs are exactly what `ChromaprintMatcher.index` produced during library
indexing (#277), base64 over the wire because JSON has no bytes.
"""
import base64

import requests

from .chromaprint_engine import RawFingerprint
from .config import (
    APP_URL,
    INDEX_PAGE_SIZE,
    RESULT_TIMEOUT,
    logger,
)
from .reference_index import ReferenceIndex, TrackRef


class ReferenceLoadError(RuntimeError):
    """The reference index could not be fetched."""


def fingerprints_url() -> str:
    return f"{APP_URL.rstrip('/')}/api/fingerprints"


def fetch_page(
    fingerprint_type: str,
    fingerprint_version: str,
    *,
    limit: int,
    offset: int,
) -> list[dict]:
    """One page of reference fingerprints for an engine and version."""
    try:
        response = requests.get(
            fingerprints_url(),
            params={
                "fingerprint_type": fingerprint_type,
                "fingerprint_version": fingerprint_version,
                "limit": limit,
                "offset": offset,
            },
            timeout=RESULT_TIMEOUT,
        )
    except requests.RequestException as e:
        raise ReferenceLoadError(f"Could not reach {fingerprints_url()}: {e}") from e

    if not response.ok:
        raise ReferenceLoadError(
            f"{fingerprints_url()} returned {response.status_code}: {response.text[:300]}"
        )

    payload = response.json()
    rows = payload.get("fingerprints", payload) if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        raise ReferenceLoadError(f"expected a list of fingerprints, got {type(rows).__name__}")
    return rows


def build_index(
    fingerprint_type: str,
    fingerprint_version: str,
    *,
    page_size: int = INDEX_PAGE_SIZE,
) -> ReferenceIndex:
    """Fetch every stored fingerprint for one engine version and index it.

    A row whose blob is null or malformed is skipped with a warning rather than
    failing the build: one bad row should cost that track, not the whole index.
    The stub engine stores null blobs by design, so this is a real case.
    """
    index = ReferenceIndex()
    offset = 0
    skipped = 0

    while True:
        rows = fetch_page(
            fingerprint_type, fingerprint_version, limit=page_size, offset=offset
        )
        if not rows:
            break

        for row in rows:
            blob = row.get("fingerprint_data")
            if not blob:
                skipped += 1
                continue
            try:
                fingerprint = RawFingerprint.from_bytes(base64.b64decode(blob))
            except Exception as e:
                logger.warning(
                    "Skipping fingerprint for track %s: %s", row.get("track_id"), e
                )
                skipped += 1
                continue
            index.add(
                TrackRef(str(row["track_id"]), int(row["friend_id"])), fingerprint
            )

        if len(rows) < page_size:
            break
        offset += page_size

    logger.info(
        "Reference index: %d track(s), %d postings, %d skipped (%s %s)",
        len(index),
        index.posting_count,
        skipped,
        fingerprint_type,
        fingerprint_version,
    )
    return index


def try_build_index(
    fingerprint_type: str, fingerprint_version: str
) -> ReferenceIndex | None:
    """Build the index, returning None rather than raising if the app is down.

    A matcher keeps whatever index it already has: serving slightly stale
    matches beats refusing to match at all while the app restarts.
    """
    try:
        return build_index(fingerprint_type, fingerprint_version)
    except ReferenceLoadError as e:
        logger.error("Could not load the reference index: %s", e)
        return None
