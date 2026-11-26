"""Command scaffolding with fake git/docker; no real build, APK or session."""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class WrapperBuildTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.package = self.root / "synthetic-package.fixture"
        self.package.write_text("synthetic test input, not an APK")
        self.trace = self.root / "trace"
        self.env = {**os.environ, "PATH": f"{self.root}:{os.environ['PATH']}", "TEST_TRACE": str(self.trace)}
        git = self.root / "git"
        git.write_text('''#!/usr/bin/env bash
set -eu
if [[ "$1" == clone ]]; then
  [[ "$*" == *"--branch 1.0.0"* ]]
  dest="${@: -1}"
  mkdir -p "$dest/tools"
  cat > "$dest/tools/build-docker.sh" <<'BUILD'
#!/usr/bin/env bash
set -eu
printf '%s\\n' "$0" "$WRAPPER_IMAGE" "$@" > "$TEST_TRACE"
BUILD
  chmod +x "$dest/tools/build-docker.sh"
else
  echo "${TEST_TAG:-1.0.0}"
fi
''')
        git.chmod(0o755)

    def run_build(self, *args):
        return subprocess.run([str(ROOT / "scripts/wrapper/build.sh"), *map(str, args)], env=self.env, capture_output=True, text=True)

    def test_build_passes_external_path_and_exact_tag_arch_image(self):
        result = self.run_build(self.package)
        self.assertEqual(result.returncode, 0, result.stderr)
        lines = self.trace.read_text().splitlines()
        self.assertEqual(lines[1:], ["wrapper-v2:1.0.0-local-amd64", str(self.package.resolve()), "--arch", "x86_64"])
        source = Path(lines[0]).parents[1]
        self.assertFalse(source.exists(), "scratch checkout is removed")
        self.assertEqual(self.package.read_text(), "synthetic test input, not an APK")

    def test_wrong_tag_never_builds(self):
        self.env["TEST_TAG"] = "1.0.1"
        self.assertNotEqual(self.run_build(self.package).returncode, 0)
        self.assertFalse(self.trace.exists())

    def test_usage_missing_package_and_repo_path(self):
        self.assertEqual(self.run_build().returncode, 2)
        self.assertNotEqual(self.run_build(self.root / "missing").returncode, 0)
        # Existing repo text is enough to verify the path guard; no APK fixture
        # is ever created or copied into the checkout.
        self.assertNotEqual(self.run_build(ROOT / "README.md").returncode, 0)
        link = self.root / "link.fixture"
        link.symlink_to(ROOT / "README.md")
        self.assertNotEqual(self.run_build(link).returncode, 0)
        self.assertFalse(self.trace.exists())


class SessionRecipeTest(unittest.TestCase):
    def test_login_status_and_missing_stack_use_only_worker_exec(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            trace = root / "trace"
            docker = root / "docker"
            docker.write_text('''#!/usr/bin/env bash
if [[ "$1" == ps ]]; then
  [[ "${TEST_EMPTY:-}" == 1 ]] || echo synthetic-project
else
  printf '%s\\n' "$*" >> "$TEST_TRACE"
fi
''')
            docker.chmod(0o755)
            op = root / "op"
            op.write_text("#!/bin/sh\nexit 1\n")
            op.chmod(0o755)
            env = {**os.environ, "PATH": f"{root}:{os.environ['PATH']}", "TEST_TRACE": str(trace)}
            def run(action):
                return subprocess.run([str(ROOT / "scripts/wrapper/session.sh"), action], env=env, capture_output=True)
            self.assertEqual(run("login").returncode, 0)
            self.assertEqual(run("status").returncode, 0)
            text = trace.read_text()
            self.assertIn("exec download-worker python -m worker.wrapper_cli login", text)
            self.assertIn("exec -T download-worker python -m worker.wrapper_cli status", text)
            self.assertNotEqual(run("invalid").returncode, 0)
            env["TEST_EMPTY"] = "1"
            self.assertNotEqual(run("status").returncode, 0)


if __name__ == "__main__":
    unittest.main()
