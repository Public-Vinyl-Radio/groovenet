"""Black-box TLS/SSE smoke tests; no physical device claims."""

import http.server
import os
import signal
import ssl
import struct
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import zlib
from pathlib import Path

BINARY = str(Path(sys.argv.pop(1)).resolve())
INPUT_BINARY = str(Path(BINARY).with_name("probe-input-test"))


def png(width=2, height=2):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">2I5B", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress((b"\x00" + b"\xff\x00\xff\xff" * 2) * 2))
        + chunk(b"IEND", b"")
    )


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.headers.get("Authorization") != "Bearer probe-secret":
            self.send_error(401)
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        try:
            if self.path == "/oversize":
                self.wfile.write(b"data:" + b"x" * 262144)
                return
            # Force framing across writes, CRLF, comments, multiline data and retry.
            for part in [
                b": heartbeat\r\n\r\neve",
                b"nt: snapshot\r\ndata: {}\r\n",
                b"data: {}\r\n\r\nevent: position\ndata: {}\n\n",
            ]:
                self.wfile.write(part)
                self.wfile.flush()
                time.sleep(0.03)
        except (BrokenPipeError, ConnectionResetError):
            pass


class ProbeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.root = Path(cls.directory.name)
        cls.cert = cls.root / "ca.pem"
        subprocess.run(
            [
                "openssl",
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-nodes",
                "-keyout",
                str(cls.root / "key.pem"),
                "-out",
                str(cls.cert),
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
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(cls.cert, cls.root / "key.pem")
        cls.server.socket = context.wrap_socket(cls.server.socket, server_side=True)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.directory.cleanup()

    def setUp(self):
        self.work = tempfile.TemporaryDirectory()
        self.addCleanup(self.work.cleanup)
        root = Path(self.work.name)
        self.token = root / "token"
        self.token.write_text("probe-secret\n")
        self.art = root / "art.png"
        self.art.write_bytes(png())
        self.state = root / "counter"
        self.args = [
            f"https://localhost:{self.server.server_port}/events",
            str(self.token),
            str(self.cert),
            str(self.art),
            str(self.state),
            "1",
        ]
        self.env = dict(os.environ, SDL_VIDEODRIVER="dummy", SDL_RENDER_DRIVER="software")

    def run_probe(self, args=None):
        result = subprocess.run(
            [BINARY, *(self.args if args is None else args)], env=self.env, capture_output=True, text=True, timeout=10
        )
        self.assertNotIn("probe-secret", result.stdout + result.stderr)
        return result

    def test_tls_sse_reconnect_and_persistence(self):
        self.args[-1] = "3"
        result = self.run_probe()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("first_frame", result.stdout)
        self.assertIn("sse event= snapshot", result.stdout)
        self.assertIn("sse event= position", result.stdout)
        self.assertGreaterEqual(result.stdout.count("connect\n"), 2)
        self.assertIn("clean_exit", result.stdout)
        self.assertEqual(self.state.read_text(), "1\n")
        self.assertIn("launch_count=2", self.run_probe().stdout)

    def test_invalid_arguments(self):
        self.assertEqual(self.run_probe([]).returncode, 2)
        args = self.args.copy()
        args[0] = "http://localhost/events"
        self.assertEqual(self.run_probe(args).returncode, 2)
        for seconds in ["0", "86401", "4294967297", "invalid", "2x", "-1"]:
            args = [*self.args[:-1], seconds]
            self.assertEqual(self.run_probe(args).returncode, 2)
        self.token.write_text("")
        self.assertEqual(self.run_probe().returncode, 2)
        self.token.write_text("bad\rheader\n")
        self.assertEqual(self.run_probe().returncode, 2)

    def test_state_and_video_failures(self):
        self.args[4] = str(self.state / "missing" / "counter")
        self.assertEqual(self.run_probe().returncode, 1)
        self.args[4] = str(self.state)
        # SDL versions differ in fallback behavior for an unknown driver name.
        result = subprocess.run(
            [INPUT_BINARY, "--renderer-failure", *self.args], env=self.env, capture_output=True, text=True, timeout=10
        )
        self.assertEqual(result.returncode, 1)
        self.env["SDL_VIDEODRIVER"] = "unavailable"
        self.assertEqual(self.run_probe().returncode, 1)

    def test_artwork_failures(self):
        self.art.unlink()
        self.assertEqual(self.run_probe().returncode, 1)
        self.art.write_bytes(png(4097, 2))
        self.assertIn("PNG too large", self.run_probe().stdout)
        broken = bytearray(png())
        broken[43] ^= 255
        self.art.write_bytes(broken)
        self.assertIn("PNG decode/texture failed", self.run_probe().stdout)

    def test_auth_and_ca_fail_closed(self):
        self.token.write_text("wrong")
        result = self.run_probe()
        self.assertIn("curl_code=22", result.stdout)
        self.assertNotIn("sse event=", result.stdout)
        self.token.write_text("probe-secret")
        self.args[2] = str(self.cert / "missing")
        result = self.run_probe()
        self.assertNotIn("sse event=", result.stdout)
        self.assertIn("connection ended", result.stdout)

    def test_stream_limit_and_wrong_hostname(self):
        self.args[0] = self.args[0].replace("/events", "/oversize")
        self.assertIn("curl_code=23", self.run_probe().stdout)
        self.args[0] = self.args[0].replace("localhost", "127.0.0.1")
        result = self.run_probe()
        self.assertIn("curl_code=60", result.stdout)
        self.assertNotIn("sse event=", result.stdout)

    def test_input_exit(self):
        result = subprocess.run(
            [INPUT_BINARY, "--input", *self.args], env=self.env, capture_output=True, text=True, timeout=10
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("joystick_button=1", result.stdout)
        self.assertIn("key=27", result.stdout)
        self.assertIn("clean_exit", result.stdout)

    def test_signal_exit(self):
        self.args[-1] = "60"
        process = subprocess.Popen(
            [BINARY, *self.args], env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
        try:
            # Synchronize with a rendered frame rather than machine startup speed.
            for line in process.stdout:
                if "first_frame" in line:
                    break
            process.send_signal(signal.SIGTERM)
            output, error = process.communicate(timeout=5)
            self.assertEqual(process.returncode, 0, error)
            self.assertIn("clean_exit", output)
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()


if __name__ == "__main__":
    unittest.main()
