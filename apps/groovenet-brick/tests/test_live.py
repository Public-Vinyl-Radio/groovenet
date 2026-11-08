"""Local TLS fixture for the production native REST/SSE worker; no saved secrets."""

import http.server
import struct
import zlib
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
playlist_commands = []
queue_commands = []
output_commands = []
output_lost = False
output_idle = False
output_discovery_fail = False
output_hold = False
output_started = threading.Event()
output_release = threading.Event()
collection_started = threading.Event()
command_release = threading.Event()
streams = []
failures = []
reordered = False
order_listed = False
race_started = threading.Event()
race_changed = threading.Event()
flaky_art_requests = 0
batch_retry_requests = 0
detail_retry_requests = 0
approval_commands = []
approval_revision = 5
approval_hold = False
approval_release = threading.Event()
approval_error = "AVAILABILITY_UNKNOWN"


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

    def image(self):
        def chunk(kind, payload):
            return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload))
        png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0))
        png += chunk(b"IDAT", zlib.compress(b"\x00\xff\x00\x00\xff")) + chunk(b"IEND", b"")
        self.send_response(200)
        self.end_headers()
        self.wfile.write(png)

    def auth(self):
        collection = self.path.startswith(("/api/tracks", "/api/playlists", "/covers/"))
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
        global reordered, order_listed, flaky_art_requests, output_lost, output_idle, output_discovery_fail, output_hold, detail_retry_requests, approval_revision, approval_hold, approval_error
        approval_mode = self.path.startswith("/approvals/")
        if approval_mode:
            self.path = self.path.removeprefix("/approvals")
        output_mode = self.path.startswith("/outputs/")
        if output_mode:
            self.path = self.path.removeprefix("/outputs")
        racing = self.path.startswith("/race/")
        if racing:
            self.path = self.path.removeprefix("/race")
        if self.path == "/public":
            if self.headers.get("Authorization"):
                failures.append("artwork credentials leaked across origin")
            return self.image()
        if not self.auth():
            return
        try:
            if approval_mode:
                if self.path.startswith("/case/"):
                    approval_error = self.path.removeprefix("/case/")
                    return self.reply(200, {})
                if self.path == "/change":
                    approval_revision += 1
                    return self.reply(200, {})
                if self.path == "/hold":
                    approval_hold = True
                    approval_release.clear()
                    return self.reply(200, {})
                if self.path == "/release":
                    approval_hold = False
                    approval_release.set()
                    return self.reply(200, {})
                def approval_player(identity="a"):
                    value = player(identity)
                    value["revision"] = approval_revision
                    return value
                if self.path == "/api/players":
                    return self.reply(200, {"players": [approval_player(), approval_player("b")]})
                if self.path.endswith("/events"):
                    if approval_hold:
                        approval_release.wait(5)
                    self.send_response(200)
                    self.send_header("Content-Type", "text/event-stream")
                    self.end_headers()
                    for sequence in range(1, 200):
                        value = {"type": "snapshot", "player": approval_player(self.path.split("/")[-2]), "worker_instance": "worker-a", "sequence": sequence}
                        self.wfile.write(("data: " + json.dumps(value) + "\n\n").encode())
                        self.wfile.flush()
                        time.sleep(0.02)
                    return
                if self.path.startswith("/api/players/"):
                    return self.reply(200, approval_player(self.path.split("/")[-1]))
            if self.path.startswith("/empty/"):
                return self.reply(200, {"players": []})
            if self.path.startswith("/large-list/"):
                return self.reply(200, {"players": [player()] * 1001})
            if self.path.startswith("/invalid-list/"):
                return self.reply(200, {"players": [{"id": "../bad", "name": "Bad"}]})
            if self.path.startswith("/unavailable/"):
                return self.reply(503, {})
            if self.path == "/collection-ready":
                return self.reply(200, {"ready": collection_started.is_set()})
            if self.path == "/reset-collection":
                collection_started.clear()
                return self.reply(200, {})
            if self.path == "/release-command":
                command_release.set()
                return self.reply(200, {})
            if self.path == "/reorder":
                reordered = True
                return self.reply(200, {})
            if self.path == "/order-ready":
                return self.reply(200, {"ready": order_listed})
            if self.path == "/covers/flaky":
                flaky_art_requests += 1
                if flaky_art_requests == 1:
                    return self.reply(503, {})
                return self.image()
            if self.path.startswith("/covers/album.jpg"):
                return self.image()
            if self.path.startswith("/error/"):
                code = self.path.removeprefix("/error/")
                return self.reply(422 if code in ("DEVICE_BUSY", "NO_AUDIO") else 409, {"code": code})
            if self.path == "/bad-error":
                return self.reply(409, {})
            if output_mode:
                if self.path == "/hold-discovery":
                    output_hold = True
                    output_started.clear()
                    output_release.clear()
                    return self.reply(200, {})
                if self.path == "/discovery-started":
                    return self.reply(200, {"ready": output_started.is_set()})
                if self.path == "/release-discovery":
                    output_hold = False
                    output_release.set()
                    return self.reply(200, {})
                if self.path == "/discovery-fail":
                    output_discovery_fail = True
                    return self.reply(200, {})
                if self.path == "/idle-output":
                    output_idle = True
                    return self.reply(200, {})
                if self.path == "/lose-output":
                    output_lost = True
                    return self.reply(200, {})
                def output_player(identity="a"):
                    p = player(identity)
                    p["assigned_output"] = "speaker" if identity == "b" and len(output_commands) < 4 else None
                    p["state"]["desired_output"] = "speaker"
                    return p
                if self.path == "/api/players":
                    return self.reply(200, {"players": [output_player(), output_player("b")]})
                if self.path.endswith("/devices"):
                    if output_hold:
                        output_started.set()
                        assert output_release.wait(5)
                    if output_discovery_fail:
                        return self.reply(503, {})
                    return self.reply(200, {"devices": [] if output_lost else [{"id": "speaker", "name": "Room", "assigned_player_id": "b" if len(output_commands) < 4 else None, "desired_by": ["a", "b"], "observed": {"availability": "idle" if output_idle else "unknown"}}]})
                if self.path.endswith("/events"):
                    self.send_response(200)
                    self.send_header("Content-Type", "text/event-stream")
                    self.end_headers()
                    self.wfile.write(("data: " + json.dumps({"type": "snapshot", "player": output_player(), "worker_instance": "output-worker", "sequence": 1}) + "\n\n").encode())
                    self.wfile.flush()
                    time.sleep(10)
                    return
                if self.path == "/api/players/a":
                    return self.reply(200, output_player())
            if self.path == "/api/players":
                rows = [player(), player("b")]
                if reordered:
                    rows.reverse()
                    order_listed = True
                return self.reply(200, {"players": rows})
            if self.path in ("/api/players/a", "/api/players/b"):
                return self.reply(200, player(self.path[-1]))
            if self.path == "/api/playlists":
                return self.reply(200, [{"id": i, "name": f"Playlist {i}"} for i in (1, 2, 3)])
            if self.path.startswith("/api/playlists/"):
                identity = int(self.path.split("/")[3])
                if identity == 8:
                    detail_retry_requests += 1
                    if detail_retry_requests == 1:
                        return self.reply(503, {})
                    return self.reply(200, {"playlist_id": 8, "tracks": [{"track_id": "retry", "friend_id": 1, "position": 0}]})
                if identity == 4:
                    return self.reply(200, {"playlist_id": 9, "tracks": []})
                if identity == 5:
                    return self.reply(503, {})
                if identity == 7:
                    return self.reply(200, {"playlist_id": 7, "tracks": [{"track_id": "slow", "friend_id": 1, "position": i} for i in range(2)]})
                if identity == 6:
                    return self.reply(200, {"playlist_id": 6, "tracks": [{"track_id": "denied", "friend_id": 1, "position": 0}]})
                refs = [] if identity == 2 else [
                    {"track_id": "same", "friend_id": (i % 2 + 1) if identity == 1 else i + 3, "position": i}
                    for i in range(27 if identity == 1 else 2)
                ]
                if identity == 3:
                    refs[1]["friend_id"] = 5
                return self.reply(200, {"playlist_id": identity, "tracks": list(reversed(refs))})
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
                if racing:
                    assert race_started.wait(5)
                    event["player"]["state"]["current_entry_id"] = "one"
                event["sequence"] = 2
                self.wfile.write(("data: " + json.dumps(event) + "\n\n").encode())
                self.wfile.flush()
                if racing:
                    race_changed.set()
                if streams.count("a") == 1 and identity == "a" and not racing:
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
        approval_mode = self.path.startswith("/approvals/")
        if approval_mode:
            self.path = self.path.removeprefix("/approvals")
        output_mode = self.path.startswith("/outputs/")
        if output_mode:
            self.path = self.path.removeprefix("/outputs")
        racing = self.path.startswith("/race/")
        if racing:
            self.path = self.path.removeprefix("/race")
        if not self.auth():
            return
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if approval_mode and self.path.endswith("/commands"):
            approval_commands.append(body)
            assert body["expected_revision"] == approval_revision
            if approval_error == "AMBIGUOUS":
                self.connection.shutdown(socket.SHUT_RDWR)
                self.connection.close()
                return
            flag = "allow_unknown" if approval_error == "AVAILABILITY_UNKNOWN" else "takeover"
            if not body.get(flag):
                return self.reply(409, {"code": approval_error})
            expected = {**approval_commands[-2], flag: True}
            assert body == expected, "approval must preserve the exact rejected command"
            return self.reply(200, {})
        if self.path == "/api/tracks/batch":
            global batch_retry_requests
            refs = body["tracks"]
            assert 1 <= len(refs) <= 25
            ref = refs[0]
            if racing and ref["friend_id"] == 2:
                race_started.set()
                assert race_changed.wait(5)
                time.sleep(0.2)
            if ref["track_id"] == "slow":
                collection_started.set()
                time.sleep(0.4)
            if ref["track_id"] == "retry":
                batch_retry_requests += 1
                if batch_retry_requests == 1:
                    return self.reply(503, {})
            if ref["track_id"] == "denied":
                return self.reply(403, {})
            rows = []
            seen = set()
            for ref in refs:
                identity = (ref["track_id"], ref["friend_id"])
                if identity in seen or ref["friend_id"] == 3:
                    continue
                seen.add(identity)
                ref = dict(ref)
                if ref["friend_id"] == 4:
                    ref["friend_id"] = 6
                row = {
                    **ref, "title": "Track title", "artist": "Track artist",
                    "album": ("Stale album" if ref["friend_id"] == 2 else "Current album") if racing else "Album",
                    "local_audio_url": None if ref["friend_id"] == 5 else "/audio/file.m4a",
                    "album_thumbnail": "/covers/flaky",
                }
                if ref["track_id"] == "wrong-id":
                    row["track_id"] = "different"
                if ref["track_id"] == "sparse":
                    del row["title"]
                    del row["artist"]
                if ref["track_id"] == "malformed":
                    del row["album"]
                rows.append(row)
                if ref["track_id"] == "duplicate":
                    rows.append(row)
            return self.reply(200, list(reversed(rows)))
        if output_mode:
            output_commands.append(body)
            n = len(output_commands)
            assert body["expected_revision"] == 5
            if n <= 3:
                assert body["type"] == "play"
                assert bool(body.get("allow_unknown")) == (n >= 2)
                assert bool(body.get("takeover")) == (n >= 3)
                return self.reply(409, {"code": ["AVAILABILITY_UNKNOWN", "SPEAKER_OCCUPIED", "DEVICE_BUSY"][n - 1]})
            if n == 4:
                assert body["type"] == "output.transfer" and body["from_revision"] == 5
                assert not body.get("play") and not body.get("takeover") and not body.get("allow_unknown")
                return self.reply(200, {"transfer": {"detached": True, "attached": False, "error": {"code": "DEVICE_BUSY"}}})
            if n == 5:
                return self.reply(409, {"code": "REVISION_CONFLICT"})
            if n in (8, 9, 10):
                assert body["type"] == "play" and not body.get("allow_unknown") and not body.get("takeover")
                return self.reply(409, {"code": {8: "REVISION_CONFLICT", 9: "SPEAKER_OCCUPIED", 10: "DEVICE_BUSY"}[n]})
            if n == 6:
                self.connection.shutdown(socket.SHUT_RDWR)
                self.connection.close()
                return
            return self.reply(200, {})
        assert self.path.endswith("/commands")
        if "entry_id" in body or body["type"] == "queue.clear":
            queue_commands.append(body)
            assert body["expected_revision"] == 5
            assert "takeover" not in body and "allow_unknown" not in body
            if len(queue_commands) == 1:
                assert body["type"] == "queue.move" and body["entry_id"] == "two" and body["to"] == 0
                return self.reply(409, {"code": "REVISION_CONFLICT"})
            if len(queue_commands) == 2:
                assert body["type"] == "queue.remove" and body["entry_id"] == "one"
                self.connection.shutdown(socket.SHUT_RDWR)
                self.connection.close()
                return
            if len(queue_commands) == 3:
                assert body["type"] == "play" and body["entry_id"] == "two"
                return self.reply(409, {"code": "SPEAKER_OCCUPIED"})
            if len(queue_commands) == 6:
                time.sleep(9)  # Exceed the real libcurl total request deadline.
                return
            return self.reply(200, {"player": player("a")})
        assert body["expected_revision"] == 5
        assert body.get("takeover") is not True
        if body["type"].startswith("queue."):
            playlist_commands.append(body)
            if len(playlist_commands) == 1:
                assert len(body["entries"]) == 27 and body["play"] is True
                assert [r["friend_id"] for r in body["entries"]] == [i % 2 + 1 for i in range(27)]
                return self.reply(409, {"code": "REVISION_CONFLICT"})
            if len(playlist_commands) == 2:
                assert body["tracks"] == [{"track_id": "same", "friend_id": 2}]
                assert "play" not in body
                self.connection.shutdown(socket.SHUT_RDWR)
                self.connection.close()
                return
            if len(playlist_commands) == 3:
                return self.reply(422, {"code": "NO_AUDIO"})
            return self.reply(200, {"player": player("a")})
        commands.append(body)
        if len(commands) == 1:
            assert command_release.wait(5), "command UI check did not release fixture"
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
    external = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    external.daemon_threads = True
    external.socket = context.wrap_socket(external.socket, server_side=True)
    external_thread = threading.Thread(target=external.serve_forever, daemon=True)
    external_thread.start()
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    environment = {
        **os.environ,
        "BRICK_TEST_DIRECTORY": directory,
        "BRICK_TEST_ART_URL": f"https://localhost:{external.server_port}/public",
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
        subprocess.run([binary, "batch-pages"], env=environment, check=True, timeout=20)
        subprocess.run([binary, "approvals"], env=environment, check=True, timeout=30)
        assert len(approval_commands) == 20, "only explicit policy approvals may retry"
        subprocess.run([binary, "adapter"], env=environment, check=True, timeout=40)
        subprocess.run([binary, "selection-failure"], env=environment, check=True, timeout=15)
        subprocess.run([binary, "metadata-race"], env=environment, check=True, timeout=15)
        subprocess.run([binary, "adapter-errors"], env=environment, check=True, timeout=15)
        subprocess.run(
            [binary, "collection-unavailable"], env={**environment, "BRICK_COLLECTION_KEY": ""}, check=True, timeout=15
        )
        subprocess.run([binary, "playlists"], env=environment, check=True, timeout=40)
        subprocess.run([binary, "browse-ui"], env=environment, check=True, timeout=30)
        subprocess.run([binary, "outputs"], env=environment, check=True, timeout=60)
        assert len(output_commands) == 10, "output writes must never replay"
        subprocess.run([binary, "queue-edits"], env=environment, check=True, timeout=40)
        assert len(queue_commands) == 6, "queue edits must never be replayed"
        assert len(playlist_commands) == 4, "no automatic queue retries"
        assert flaky_art_requests >= 2, "reconnect must retry failed artwork"
        assert not failures, failures
        assert [c["type"] for c in commands] == ["next", "pause", "volume", "volume", "previous", "resume"], commands
        assert streams.count("a") >= 3 and "b" in streams, streams
    finally:
        external.shutdown()
        external.server_close()
        external_thread.join()
        server.shutdown()
        server.server_close()
        thread.join()
print("TLS, credential separation, commands, ambiguous writes, switching and refresh passed")
