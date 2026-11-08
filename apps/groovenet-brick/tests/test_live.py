"""Local TLS fixture for the production native REST/SSE worker; no saved secrets."""

import http.server
import json
import os
from pathlib import Path
import secrets
import socket
import ssl
import subprocess
import sys
import tempfile
import threading
import time

binary = str(Path(sys.argv[1]).resolve())
player_key, collection_key = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
commands = []
streams = []
failures = []
reordered = False
order_listed = False


def player(identity="a"):
    return {
        "id": identity,
        "name": "Room" if identity == "a" else "Other room",
        "revision": 5,
        "state": {
            "queue": [
                {"id": "one", "track_id": "same", "friend_id": 1, "title": "First", "artist": "Artist"},
                {"id": "two", "track_id": "same", "friend_id": 2, "title": "Second", "artist": "Artist"},
            ],
            "current_entry_id": "two",
            "status": "playing" if identity == "a" else "paused",
            "position": 12,
            "duration": 120,
            "volume": 50,
        },
    }


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, status, value):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(value).encode())

    def auth(self):
        collection = self.path.startswith(("/api/tracks", "/api/playlists"))
        expected = collection_key if collection else player_key
        if collection and not self.headers.get("Authorization"):
            self.reply(401, {})
            return False
        if self.headers.get("Authorization") != f"Bearer {expected}":
            failures.append("credential separation")
            self.reply(401, {})
            return False
        if self.headers.get("Last-Event-ID"):
            failures.append("replay requested")
        return True

    def do_GET(self):
        global reordered, order_listed
        if not self.auth():
            return
        try:
            if self.path.startswith("/empty/"):
                return self.reply(200, {"players": []})
            if self.path.startswith("/large-list/"):
                return self.reply(200, {"players": [player()] * 1001})
            if self.path.startswith("/invalid-list/"):
                return self.reply(200, {"players": [{"id": "../bad", "name": "Bad"}]})
            if self.path.startswith("/unavailable/"):
                return self.reply(503, {})
            if self.path == "/reorder":
                reordered = True
                return self.reply(200, {})
            if self.path == "/order-ready":
                return self.reply(200, {"ready": order_listed})
            if self.path == "/api/players":
                rows = [player(), player("b")]
                if reordered:
                    rows.reverse()
                    order_listed = True
                return self.reply(200, {"players": rows})
            if self.path in ("/api/players/a", "/api/players/b"):
                return self.reply(200, player(self.path[-1]))
            if self.path.startswith("/api/playlists"):
                return self.reply(200, [])
            if self.path.startswith("/api/players/") and self.path.endswith("/events"):
                identity = self.path.split("/")[-2]
                streams.append(identity)
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.end_headers()
                event = {"type": "snapshot", "player": player(identity), "worker_instance": "worker-a", "sequence": 1}
                if streams.count("a") >= 2:
                    event["player"]["state"]["position"] = 44
                wire = "event: snapshot\r\ndata: " + json.dumps(event) + "\r\n\r\n"
                for part in (wire[:7], wire[7:31], wire[31:]):
                    self.wfile.write(part.encode())
                    self.wfile.flush()
                    time.sleep(0.01)
                event["sequence"] = 2
                self.wfile.write(("data: " + json.dumps(event) + "\n\n").encode())
                self.wfile.flush()
                if streams.count("a") == 1 and identity == "a":
                    return  # Real EOF forces backoff and a fresh subscription.
                # Hold open; cancellation must interrupt idle reads, not await EOF.
                for _ in range(100):
                    self.wfile.write(b": heartbeat\n\n")
                    self.wfile.flush()
                    time.sleep(0.05)
                return
            if self.path in ("/events", "/large-events"):
                self.send_response(200)
                self.end_headers()
                self.wfile.write(
                    b"data: " + b"x" * (2097153 if self.path == "/large-events" else 1) + b"\n\ndata:{}\n\n"
                )
                return
            if self.path == "/large":
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"x" * 2097153)
                return
            code = int(self.path[1:])
            return self.reply(code, {"code": "NO_AUDIO" if code == 422 else "ERROR"})
        except (BrokenPipeError, ConnectionResetError, ssl.SSLEOFError):
            pass

    def do_POST(self):
        if not self.auth():
            return
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if self.path == "/api/tracks/batch":
            ref = body["tracks"][0]
            if ref["friend_id"] == 3:
                return self.reply(200, [])
            if ref["friend_id"] == 4:
                ref["friend_id"] = 6
            return self.reply(
                200,
                [
                    {
                        **ref,
                        "album": "Album",
                        "local_audio_url": None if ref["friend_id"] == 5 else "/audio/file.m4a",
                        "album_thumbnail": "/covers/album.jpg",
                    }
                ],
            )
        assert self.path.endswith("/commands")
        assert body["expected_revision"] == 5
        assert body.get("takeover") is not True
        commands.append(body)
        if len(commands) == 1:
            return self.reply(409, {"code": "REVISION_CONFLICT"})
        if len(commands) == 2:
            self.connection.shutdown(socket.SHUT_RDWR)
            self.connection.close()
            return
        return self.reply(200, {"player": player("b")})


with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    cert, key = root / "ca.pem", root / "key.pem"
    subprocess.run(
        [
            "openssl",
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-keyout",
            str(key),
            "-out",
            str(cert),
            "-days",
            "1",
            "-subj",
            "/CN=localhost",
            "-addext",
            "subjectAltName=DNS:localhost",
        ],
        check=True,
        capture_output=True,
    )
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(cert, key)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    environment = {
        **os.environ,
        "BRICK_URL": f"https://localhost:{server.server_port}",
        "BRICK_PLAYER_KEY": player_key,
        "BRICK_COLLECTION_KEY": collection_key,
        "BRICK_CA_FILE": str(cert),
        "BRICK_INSECURE_TLS": "0",
    }
    try:
        subprocess.run([binary, "requests"], env=environment, check=True, timeout=25)
        subprocess.run([binary, "untrusted"], env={**environment, "BRICK_CA_FILE": ""}, check=True, timeout=15)
        subprocess.run(
            [binary, "untrusted"],
            env={**environment, "BRICK_URL": f"https://127.0.0.1:{server.server_port}"},
            check=True,
            timeout=15,
        )
        subprocess.run(
            [binary, "requests"],
            env={**environment, "BRICK_CA_FILE": "", "BRICK_INSECURE_TLS": "1"},
            check=True,
            timeout=25,
        )
        subprocess.run([binary, "adapter"], env=environment, check=True, timeout=40)
        subprocess.run([binary, "adapter-errors"], env=environment, check=True, timeout=15)
        subprocess.run(
            [binary, "collection-unavailable"], env={**environment, "BRICK_COLLECTION_KEY": ""}, check=True, timeout=15
        )
        assert not failures, failures
        assert [c["type"] for c in commands] == ["next", "pause", "volume", "volume", "previous", "resume"], commands
        assert streams.count("a") >= 3 and "b" in streams, streams
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
print("TLS, credential separation, commands, ambiguous writes, switching and refresh passed")
