"""Stable publishing requires complete evidence for the exact packaged executable."""

import copy
import hashlib
import importlib.util
import io
import json
import runpy
import sys
from unittest.mock import patch
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    "qualify", Path(__file__).resolve().parents[1] / "knulli/qualify.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class QualificationTests(unittest.TestCase):
    def test_gate(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "release.tar.gz"
            with tarfile.open(archive, "w:gz") as package:
                info = tarfile.TarInfo("groovenet-brick/groovenet-brick")
                info.size = 6
                package.addfile(info, io.BytesIO(b"binary"))
                info = tarfile.TarInfo("Groovenet.sh")
                info.size = 8
                package.addfile(info, io.BytesIO(b"launcher"))
            evidence = root / "qualification.json"
            report = root / "report.md"
            report.write_text("Measured operator observations")
            record = {
                "device": "TrimUI Brick", "firmware": "Scarab 2026/05/11",
                "operator": "Test operator", "date": "2026-11-08", "report": "report.md",
                "binary_sha256": hashlib.sha256(b"binary").hexdigest(),
                "launcher_sha256": hashlib.sha256(b"launcher").hexdigest(),
                "checks": dict.fromkeys(module.CHECKS, True),
            }
            def run(value):
                evidence.write_text(json.dumps(value))
                module.qualify(archive, evidence)
            run(record)
            with patch.object(sys, "argv", ["qualify.py", str(archive), str(evidence)]):
                runpy.run_path(str(Path(module.__file__)), run_name="__main__")
            for field in ("device", "firmware", "operator", "date", "report", "binary_sha256", "launcher_sha256"):
                invalid = copy.deepcopy(record)
                invalid[field] = ""
                with self.assertRaises(ValueError):
                    run(invalid)
            for check in module.CHECKS:
                for value in (False, "pending", 1):
                    invalid = copy.deepcopy(record)
                    invalid["checks"][check] = value
                    with self.assertRaises(ValueError):
                        run(invalid)
                invalid = copy.deepcopy(record)
                del invalid["checks"][check]
                with self.assertRaises(ValueError):
                    run(invalid)
            report.unlink()
            with self.assertRaises(ValueError):
                run(record)
            report.write_text(" ")
            with self.assertRaises(ValueError):
                run(record)


if __name__ == "__main__":
    unittest.main()
