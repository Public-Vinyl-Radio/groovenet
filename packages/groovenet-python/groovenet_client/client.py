"""Small synchronous client; workers own retry and best-effort policy."""

import os
from typing import Any, Self, cast
from urllib.parse import quote

import requests

from .types import (
    CoverArtResult,
    FileStats,
    FingerprintPage,
    FingerprintUpsert,
    IngestResult,
    SetResult,
    StoredFingerprint,
    TrackUpdate,
)


class GroovenetApiError(RuntimeError):
    """An app response outside 200–299, with its status and best message."""

    def __init__(self, status: int, message: str):
        self.status = status
        self.message = message
        super().__init__(f"API Error: {message} (HTTP {status})")


class GroovenetClient:
    def __init__(
        self,
        base_url: str | None = None,
        *,
        timeout: float = 30,
        token: str | None = None,
        client_name: str = "worker",
        session: requests.Session | None = None,
    ):
        self.base_url = (base_url if base_url is not None else os.getenv("APP_URL", "http://app:3000")).rstrip("/")
        self.timeout = timeout
        self.session = session if session is not None else requests.Session()
        self.headers = {"X-Groovenet-Client": client_name}
        api_token = token if token is not None else os.getenv("GROOVENET_TOKEN")
        if api_token:
            self.headers["Authorization"] = f"Bearer {api_token}"

    def close(self) -> None:
        self.session.close()

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    def _request(self, method: str, path: str, *, timeout: float | None = None, **kwargs: Any) -> requests.Response:
        response = self.session.request(
            method,
            f"{self.base_url}{path}",
            headers=self.headers,
            timeout=self.timeout if timeout is None else timeout,
            # A redirect is a non-2xx response too; never turn it into success.
            allow_redirects=False,
            **kwargs,
        )
        if not 200 <= response.status_code < 300:
            try:
                body = response.json()
            except (ValueError, requests.RequestException):
                body = None
            message = (body.get("error") or body.get("message")) if isinstance(body, dict) else None
            response.close()
            raise GroovenetApiError(response.status_code, str(message or f"HTTP {response.status_code}"))
        return response

    def update_track(self, payload: TrackUpdate) -> None:
        with self._request("PATCH", "/api/tracks", json=payload):
            pass

    def report_job_outcome(self, job_id: str, *, timeout: float | None = None) -> None:
        with self._request("POST", f"/api/jobs/{quote(job_id, safe='')}/outcome", timeout=timeout):
            pass

    def extract_cover_art(self, release_id: str, friend_id: int, *, timeout: float | None = None) -> CoverArtResult:
        with self._request(
            "POST",
            f"/api/albums/{quote(release_id, safe='')}/artwork/match",
            params={"friend_id": friend_id},
            timeout=timeout,
        ) as response:
            return cast(CoverArtResult, response.json())

    def fetch_audio(self, filename: str, *, timeout: float | None = None) -> requests.Response:
        """Stream app audio. The caller must close the response (use `with`)."""
        return self._request("GET", "/api/audio", params={"filename": filename}, stream=True, timeout=timeout)

    def claim_ingest(self, ingest_id: str) -> None:
        with self._request("POST", f"/api/audio/ingest/{quote(ingest_id, safe='')}/claim"):
            pass

    def report_ingest_result(self, ingest_id: str, payload: IngestResult) -> None:
        with self._request("POST", f"/api/audio/ingest/{quote(ingest_id, safe='')}/result", json=payload):
            pass

    def claim_set_derivation(self, derivation_id: str) -> None:
        with self._request("POST", f"/api/set-derivations/{quote(derivation_id, safe='')}/claim"):
            pass

    def report_set_result(self, derivation_id: str, payload: SetResult) -> None:
        with self._request("POST", f"/api/set-derivations/{quote(derivation_id, safe='')}/result", json=payload):
            pass

    def upsert_fingerprint(self, payload: FingerprintUpsert) -> None:
        with self._request("POST", "/api/fingerprints", json=payload):
            pass

    def record_file_stats(self, payload: FileStats) -> None:
        with self._request("PATCH", "/api/fingerprints", json=payload):
            pass

    def list_fingerprints(
        self,
        fingerprint_type: str,
        fingerprint_version: str,
        *,
        limit: int,
        offset: int,
    ) -> FingerprintPage | list[StoredFingerprint]:
        with self._request(
            "GET",
            "/api/fingerprints",
            params={
                "fingerprint_type": fingerprint_type,
                "fingerprint_version": fingerprint_version,
                "limit": limit,
                "offset": offset,
            },
        ) as response:
            return cast(FingerprintPage | list[StoredFingerprint], response.json())
