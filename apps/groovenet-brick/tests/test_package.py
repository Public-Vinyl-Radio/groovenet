"""Exercise the real launcher in an isolated userdata tree; inspect built archives."""

import hashlib
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class LauncherTests(unittest.TestCase):
    def test_launcher(self):
        source = (ROOT / "knulli/Groovenet.sh").read_text()
        subprocess.run(["sh", "-n", str(ROOT / "knulli/Groovenet.sh")], check=True)
        with tempfile.TemporaryDirectory(prefix="brick ports ") as directory:
            root = Path(directory)
            launcher = root / "Groovenet.sh"
            # Relocate the fixed firmware storage path, leaving all shell logic intact.
            launcher.write_text(source.replace("/userdata", str(root / "userdata")))
            missing = subprocess.run(["sh", str(launcher)], capture_output=True)
            self.assertNotEqual(missing.returncode, 0)
            self.assertIn(b"provision", missing.stderr)
            state = root / "userdata/system/configs/groovenet-brick"
            (state / "config").write_text(
                "BRICK_PLAYER_KEY='private-test-value'\nBRICK_URL='https://example.invalid'\n"
            )
            app = root / "groovenet-brick"
            app.mkdir()
            binary = app / "groovenet-brick"
            binary.write_text(
                '#!/bin/sh\n[ "$BRICK_PLAYER_KEY" = private-test-value ] || exit 8\n'
                '[ "$BRICK_URL" = https://example.invalid ] || exit 9\n'
                '[ "$XDG_CACHE_HOME" = "$XDG_CONFIG_HOME/cache" ] || exit 10\n'
                'printf "%s\\n" "$@"\nexit 17\n'
            )
            binary.chmod(0o755)
            result = subprocess.run(["sh", str(launcher)], capture_output=True)
            self.assertEqual(result.returncode, 17)  # exec preserves failures for Ports
            self.assertEqual(result.stdout, b"")
            log = state / "preview.log"
            self.assertEqual(log.stat().st_mode & 0o777, 0o600)
            self.assertEqual(
                log.read_text().splitlines(),
                ["--platform", "knulli", "--mode", "live", "--font",
                 str(app / "assets/DejaVuSans.ttf")],
            )
            log.write_text("old log must not accumulate\n")
            subprocess.run(["sh", str(launcher)], capture_output=True)
            self.assertNotIn("old log", log.read_text())
            self.assertNotIn("private-test-value", log.read_text())

    @unittest.skipUnless(os.environ.get("BRICK_ARCHIVE"), "build with just brick-package first")
    def test_archive(self):
        archive = Path(os.environ["BRICK_ARCHIVE"])
        with tarfile.open(archive) as package:
            files = {m.name: m for m in package.getmembers() if m.isfile()}
            self.assertEqual(set(files), {
                "Groovenet.sh", "groovenet-brick/SHA256SUMS", "groovenet-brick/groovenet-brick",
                "groovenet-brick/BUILD.txt", "groovenet-brick/INSTALL.md", "groovenet-brick/LICENSE",
                "groovenet-brick/config.example", "groovenet-brick/assets/DejaVuSans.ttf",
                "groovenet-brick/assets/FONT-LICENSE",
            })
            def read(name):
                return package.extractfile(name).read()
            binary = read("groovenet-brick/groovenet-brick")
            self.assertEqual(binary[:5], b"\x7fELF\x02")  # ELF64
            self.assertEqual(int.from_bytes(binary[18:20], "little"), 183)  # AArch64
            self.assertTrue(files["Groovenet.sh"].mode & 0o111)
            self.assertTrue(files["groovenet-brick/groovenet-brick"].mode & 0o111)
            self.assertEqual(read("groovenet-brick/LICENSE"), (ROOT.parents[1] / "LICENSE").read_bytes())
            self.assertIn(b"Permission", read("groovenet-brick/assets/FONT-LICENSE"))
            self.assertEqual(read("groovenet-brick/config.example"), (ROOT / "knulli/config.example").read_bytes())
            for line in read("groovenet-brick/SHA256SUMS").decode().splitlines():
                digest, name = line.split()
                self.assertEqual(hashlib.sha256(read(name)).hexdigest(), digest)
            self.assertIn(b"aarch64-linux-gnu", read("groovenet-brick/BUILD.txt"))


if __name__ == "__main__":
    unittest.main()
