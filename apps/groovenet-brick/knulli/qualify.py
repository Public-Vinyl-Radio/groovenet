"""Fail closed before publishing a stable asset; never infer hardware acceptance."""

import hashlib
import json
from pathlib import Path
import sys
import tarfile

CHECKS = {
    "sdk_abi", "launch", "remembered_player", "artwork", "saved_playlist",
    "volume_isolation", "external_controller", "long_display", "wifi_reconnect",
    "screen_off", "real_suspend_resume", "exit_keeps_playing", "unplugged_battery",
    "queue", "outputs",
}


def qualify(archive, evidence):
    record = json.loads(Path(evidence).read_text())
    if record["device"] != "TrimUI Brick" or record["firmware"] != "Scarab 2026/05/11":
        raise ValueError("Unsupported device/firmware")
    if not record["operator"] or not record["date"] or not record["report"]:
        raise ValueError("Operator, date and public evidence report are required")
    if set(record["checks"]) != CHECKS or any(
        result is not True for result in record["checks"].values()
    ):
        raise ValueError("Physical qualification is incomplete; publish a CI preview only")
    with tarfile.open(archive) as package:
        for name, key in (("groovenet-brick/groovenet-brick", "binary_sha256"),
                          ("Groovenet.sh", "launcher_sha256")):
            payload = package.extractfile(name).read()
            if hashlib.sha256(payload).hexdigest() != record[key]:
                raise ValueError("Qualification does not apply to this binary/launcher")
    report = Path(evidence).parent / record["report"]
    if not report.is_file() or not report.read_text().strip():
        raise ValueError("Qualification report is missing")


if __name__ == "__main__":
    qualify(*sys.argv[1:])
