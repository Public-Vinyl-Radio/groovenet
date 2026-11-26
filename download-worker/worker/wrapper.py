"""Bounded, noninteractive readiness checks; never log wrapper responses."""

import os
import platform

import requests
from gamdl.api import WrapperApi


class WrapperNotReady(RuntimeError):
    pass


def wrapper_url() -> str | None:
    configured = (os.getenv("GAMDL_WRAPPER_URL") or "").strip()
    if configured:
        return configured
    profiles = (os.getenv("COMPOSE_PROFILES") or "").replace(" ", ",").split(",")
    return "http://gamdl-wrapper:80" if "lossless" in profiles else None


def request_wrapper(
    method: str, url: str, endpoint: str, *, allowed_statuses: tuple[int, ...] = (200, 202), **kwargs
) -> requests.Response:
    try:
        # Local account material must not inherit proxy or .netrc settings.
        with requests.Session() as session:
            session.trust_env = False
            response = session.request(method, url.rstrip("/") + endpoint, timeout=(3, 10), **kwargs)
        if response.status_code not in allowed_statuses:
            raise WrapperNotReady("Wrapper v2 request failed; check sidecar status and retry")
        return response
    except requests.RequestException:
        raise WrapperNotReady("Wrapper v2 is unreachable; start the lossless profile and retry") from None


def wrapper_info(url: str) -> str:
    try:
        info = request_wrapper("GET", url, "/info").json()
        WrapperApi.validate_info(info)
        architecture = info["architecture"]
        expected = {"x86_64": "x86_64", "aarch64": "arm64-v8a", "arm64": "arm64-v8a"}.get(platform.machine())
        if architecture != expected:
            raise ValueError("wrong architecture")
        return architecture
    except Exception as error:
        if isinstance(error, WrapperNotReady):
            raise
        raise WrapperNotReady(
            "Wrapper v2 requires version 1.0.0, protocol 1 and the matching worker architecture: "
            "apple-music-1109-x86_64 (x86_64) or apple-music-1109-arm64-v8a (arm64-v8a)"
        ) from None


def check_wrapper_ready(url: str) -> str:
    architecture = wrapper_info(url)
    try:
        state = request_wrapper("GET", url, "/session").json().get("state")
        if state == "logged_out":
            request_wrapper("POST", url, "/session/restore", allowed_statuses=(200, 202, 404))
            state = request_wrapper("GET", url, "/session").json().get("state")
    except (ValueError, AttributeError):
        raise WrapperNotReady("Wrapper v2 returned invalid session state") from None
    if state != "authenticated":
        raise WrapperNotReady("Wrapper v2 is signed out; run just wrapper-login, then retry")
    return architecture
