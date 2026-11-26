#!/usr/bin/env bash
# Generated audio only. Uses scratch /tmp in the worktree services, never /audio.
set -euo pipefail
source "$(dirname "$0")/worktree/lib.sh"
project="$(detect_running_compose_project)"
[[ -n "$project" ]] || usage_error "Start the worktree downloads and fingerprint profiles first"
scratch="$(mktemp -d)"
remote="/tmp/groovenet-lossless-$(basename "$scratch")"
cleanup() {
  for service in essentia fingerprint-service; do
    compose_exec_detect "$project" exec -T "$service" rm -rf "$remote" >/dev/null 2>&1 || true
  done
  rm -rf "$scratch"
}
trap cleanup EXIT
# Invoke the actual worker converter, not a separate ffmpeg approximation.
uv run --project "$REPO_ROOT/download-worker" python - "$scratch" <<'PY'
import hashlib
import json
import subprocess
import sys
from pathlib import Path
sys.path.insert(0, str(Path.cwd() / "download-worker"))
from worker.lossless import convert_alac_to_flac
root = Path(sys.argv[1])
alac = root / "sample.m4a"
subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=96000:duration=30", "-c:a", "alac", "-sample_fmt", "s32p", str(alac)], check=True)
def md5(path):
    return subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(path), "-f", "md5", "-"]).strip().decode()
expected = md5(alac)
old_hash = hashlib.sha256(alac.read_bytes()).hexdigest()
flac = Path(convert_alac_to_flac(str(alac)))
assert md5(flac) == expected
(root / "source-sha256").write_text(old_hash)
probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(flac)]))["streams"][0]
assert (probe["codec_name"], probe["bits_per_raw_sample"], probe["sample_rate"]) == ("flac", "24", "96000")
print("Generated ALAC → FLAC: bit-exact PCM MD5, FLAC 24-bit/96 kHz")
PY
for service in essentia fingerprint-service; do
  compose_exec_detect "$project" exec -T "$service" mkdir -p "$remote"
  for filename in sample.flac source-sha256; do
    compose_exec_detect "$project" exec -T "$service" sh -c 'cat > "$1"' sh "$remote/$filename" < "$scratch/$filename"
  done
done
compose_exec_detect "$project" exec -T essentia essentia_streaming_extractor_music "$remote/sample.flac" "$remote/analysis.json" /etc/essentia/profile.yaml >/dev/null
compose_exec_detect "$project" exec -T essentia python3 -c 'import json,sys; data=json.load(open(sys.argv[1])); assert "rhythm" in data and "tonal" in data; print("Essentia decoded FLAC and returned rhythm/tonal analysis")' "$remote/analysis.json"
compose_exec_detect "$project" exec -T fingerprint-service python - "$remote" <<'PY'
import hashlib
import sys
from pathlib import Path
from fingerprint_service.audio import decode_to_pcm
from fingerprint_service.chromaprint_engine import fingerprint_pcm
from fingerprint_service.indexer import needs_index
root = Path(sys.argv[1])
clip = decode_to_pcm(str(root / "sample.flac"))
result = fingerprint_pcm(clip.pcm, clip.sample_rate)
assert result.values
assert needs_index((root / "source-sha256").read_text(), hashlib.sha256((root / "sample.flac").read_bytes()).hexdigest())
print("Fingerprint decode + Chromaprint accepted FLAC; changed SHA-256 requires re-indexing")
PY
