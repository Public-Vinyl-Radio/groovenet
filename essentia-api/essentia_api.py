import ipaddress
import json
import os
import re
import socket
import subprocess
import tempfile
from urllib.parse import urlparse

import requests
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI()


@app.get("/health")
async def health():
    return {"status": "ok"}


def get_allowed_internal_hosts() -> set[str]:
    raw = os.getenv(
        "ESSENTIA_ALLOWED_HOSTS",
        "app,localhost,127.0.0.1,host.docker.internal",
    )
    return {host.strip().lower() for host in raw.split(",") if host.strip()}

def is_allowed_http_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        if not parsed.hostname:
            return False
        if parsed.hostname.lower() in get_allowed_internal_hosts():
            return True

        infos = socket.getaddrinfo(
            parsed.hostname,
            parsed.port or (443 if parsed.scheme == "https" else 80),
        )
        for info in infos:
            ip = ipaddress.ip_address(info[4][0])
            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_link_local
                or ip.is_multicast
                or ip.is_reserved
                or ip.is_unspecified
            ):
                return False
        return True
    except Exception:
        return False

@app.post("/analyze")
async def analyze(request: Request):
    data = await request.json()
    source = data.get("filename")
    if not source:
        return JSONResponse({"error": "No filename provided"}, status_code=400)

    temp_file_path = None
    if isinstance(source, str) and os.path.isfile(source):
        analysis_path = source
    else:
        if not isinstance(source, str) or not is_allowed_http_url(source):
            return JSONResponse({"error": "Invalid or disallowed URL"}, status_code=400)

        resp = requests.get(source, allow_redirects=False, timeout=10)
        if not resp.ok:
            return JSONResponse(
                {"error": f"Couldn’t download file: {resp.status_code}"},
                status_code=502,
            )

        parsed = urlparse(source)
        path_ext = os.path.splitext(os.path.basename(parsed.path))[1].lower()
        suffix = path_ext if re.fullmatch(r"\.[a-z0-9]{1,10}", path_ext) else ".mp3"
        tf = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        tf.write(resp.content)
        tf.flush()
        tf.close()
        temp_file_path = tf.name
        analysis_path = temp_file_path

    # run Essentia on that temp file
    cmd = [
        "essentia_streaming_extractor_music",
        analysis_path,
        "-",
        "/etc/essentia/profile.yaml"
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if temp_file_path and os.path.exists(temp_file_path):
        os.unlink(temp_file_path)

    if proc.returncode != 0:
        return JSONResponse({"error": proc.stderr}, status_code=500)

    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        return JSONResponse(
            {"error": f"Essentia produced invalid JSON: {e}"},
            status_code=500,
        )
