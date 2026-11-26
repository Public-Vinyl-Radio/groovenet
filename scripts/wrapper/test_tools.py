"""Command scaffolding with fake git/docker; no real build, APK or session."""
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


# Public 1.0.0 source contexts only; no Android or Apple binaries.
RUNTIME_HPP_FIXTURE = '''#pragma once
#include "common.hpp"
#include "protocol.hpp"
#include "symbols.hpp"
#include "abi.hpp"
#include <memory>
#include <functional>
#include <dlfcn.h>
#include <cstring>
#include <atomic>
namespace worker {
using Shared=std::shared_ptr<void>;
static_assert(sizeof(Shared)==16 && sizeof(std::string)==24,"Pinned Android libc++ ABI required");
template<class T>T symbol(const char* name) {
    auto p=dlsym(RTLD_DEFAULT,name);if(!p)throw Error("missing_native_symbol",false,true);return reinterpret_cast<T>(p);
}
template<class R,class... Args>R call(const char* name,Args... args){return symbol<R(*)(Args...)>(name)(args...);}
struct NativeObject {
'''
RUNTIME_CPP_FIXTURE = '''    cached_session=stat((directory+"/mpl_db/kvs.sqlitedb").c_str(),&st)==0&&S_ISREG(st.st_mode)&&st.st_size>0;
    // Hash every ABI-bearing dependency, not just the instrumented library.
    for(const auto& pair:apple_libraries)if(sha256_file(std::string("/system/lib64/")+pair.first)!=pair.second)throw Error("unsupported_library",false,true);
    for(const char* name:{"libCoreFP.so","libCoreLSKD.so","libandroidappmusic.so","libstoreservicescore.so","libmediaplatform.so"})
        if(!dlopen((std::string("/system/lib64/")+name).c_str(),RTLD_NOW|RTLD_GLOBAL))throw Error("native_load_failed",false,true);
    std::vector<const char*> servers;for(const auto& ip:dns)servers.push_back(ip.c_str());
    call<void>(names::resolv,0u,servers.data(),int(servers.size()),".");
    call<void>(names::FootHillConfig_config,&parts[8]);
'''
DEVICE_PATCH = ROOT / "scripts/wrapper/compat/fresh-device-fingerprint.patch"


def device_info_fixture():
    """Pre-image excerpt of public device_info.rs, rebuilt from the patch's own
    context and removed lines, so git apply exercises the real patch."""
    lines, in_hunk = [], False
    for line in DEVICE_PATCH.read_text().splitlines():
        if line.startswith("@@"):
            in_hunk = True
        elif in_hunk and line[:1] in (" ", "-"):
            lines.append(line[1:])
    return "\n".join(lines) + "\n"


class WrapperBuildTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.package = self.root / "synthetic package.fixture"
        self.package.write_text("synthetic test input, not an APK")
        self.trace = self.root / "trace"
        self.env = {**os.environ, "PATH": f"{self.root}:{os.environ['PATH']}", "TEST_TRACE": str(self.trace)}
        uname = self.root / "uname"
        uname.write_text('#!/bin/sh\necho "${TEST_HOST_ARCH:-x86_64}"\n')
        uname.chmod(0o755)
        fixtures = self.root / "native-fixture"
        fixtures.mkdir()
        (fixtures / "runtime.hpp").write_text(RUNTIME_HPP_FIXTURE)
        (fixtures / "runtime.cpp").write_text(RUNTIME_CPP_FIXTURE)
        rust = self.root / "rust-fixture"
        rust.mkdir()
        (rust / "device_info.rs").write_text(device_info_fixture())
        self.env["TEST_RUST_FIXTURES"] = str(rust)
        self.env["TEST_NATIVE_FIXTURES"] = str(fixtures)
        self.env["TEST_REAL_GIT"] = shutil.which("git")
        git = self.root / "git"
        git.write_text('''#!/usr/bin/env bash
set -eu
if [[ "$1" == clone ]]; then
  [[ "$*" == *"--branch 1.0.0"* ]]
  dest="${@: -1}"
  mkdir -p "$dest/tools"
  cp -R "$TEST_NATIVE_FIXTURES" "$dest/native"
  cp -R "$TEST_RUST_FIXTURES" "$dest/src"
  if [[ "${TEST_DEVICE_DRIFT:-}" == 1 ]]; then
    echo '// incompatible source' > "$dest/src/device_info.rs"
  fi
  if [[ "${TEST_SOURCE_DRIFT:-}" == 1 ]]; then
    echo '// incompatible source' > "$dest/native/runtime.hpp"
  fi
  cat > "$dest/tools/build-docker.sh" <<'BUILD'
#!/usr/bin/env bash
set -eu
source="$(dirname "$0")/../native"
device="$(dirname "$0")/../src/device_info.rs"
grep -q 'Music/5.0.2/Android/10/Pixel 8/7663314/en-US/en-US/' "$device"
grep -q 'random_hex::<8>' "$device"
grep -q 'random_hex::<16>' "$device"
! grep -q 'Samsung S9/7663313/en-US/en-US/";' "$device"
if [[ "$3" == aarch64 ]]; then
  test -f "$source/symbol_lookup.hpp"
  ! grep -q RTLD_DEFAULT "$source/runtime.hpp"
  grep -q 'load_symbol_scope(nullptr)' "$source/runtime.cpp"
else
  test ! -e "$source/symbol_lookup.hpp"
  grep -q RTLD_DEFAULT "$source/runtime.hpp"
fi
printf '%s\\n' "$0" "$WRAPPER_IMAGE" "$@" > "$TEST_TRACE"
exit "${TEST_BUILD_EXIT:-0}"
BUILD
  chmod +x "$dest/tools/build-docker.sh"
elif [[ "$1" == -C && "$3" == apply ]]; then
  exec "$TEST_REAL_GIT" "$@"
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

    def test_host_defaults_and_explicit_overrides(self):
        for host, args, arch, image in [
            ("x86_64", [], "x86_64", "amd64"),
            ("aarch64", [], "aarch64", "arm64"),
            ("arm64", [], "aarch64", "arm64"),
            ("arm64", ["--arch", "x86_64"], "x86_64", "amd64"),
            ("x86_64", ["--arch", "aarch64"], "aarch64", "arm64"),
        ]:
            with self.subTest(host=host, args=args):
                self.env["TEST_HOST_ARCH"] = host
                result = self.run_build(self.package, *args)
                self.assertEqual(result.returncode, 0, result.stderr)
                lines = self.trace.read_text().splitlines()
                self.assertEqual(lines[1:], [f"wrapper-v2:1.0.0-local-{image}", str(self.package.resolve()), "--arch", arch])
                self.assertFalse(Path(lines[0]).parents[1].exists())

    def test_bad_arch_and_arguments_never_build(self):
        for args in [("--arch", ""), ("--arch", "riscv64"), ("--arch",), ("--wrong", "aarch64"), ("extra",)]:
            with self.subTest(args=args):
                self.assertEqual(self.run_build(self.package, *args).returncode, 2)
        self.env["TEST_HOST_ARCH"] = "riscv64"
        self.assertEqual(self.run_build(self.package).returncode, 2)
        self.assertFalse(self.trace.exists())

    def test_just_recipe_preserves_argument_boundaries(self):
        result = subprocess.run(
            ["just", "wrapper-build", str(self.package), "--arch", "aarch64"],
            cwd=ROOT, env=self.env, capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.trace.read_text().splitlines()[2:], [str(self.package.resolve()), "--arch", "aarch64"])

    def test_compat_patch_drift_never_builds(self):
        self.env["TEST_SOURCE_DRIFT"] = "1"
        self.assertNotEqual(self.run_build(self.package, "--arch", "aarch64").returncode, 0)
        self.assertFalse(self.trace.exists())

    def test_device_patch_drift_never_builds_either_arch(self):
        self.env["TEST_DEVICE_DRIFT"] = "1"
        for arch in ("x86_64", "aarch64"):
            with self.subTest(arch=arch):
                self.assertNotEqual(self.run_build(self.package, "--arch", arch).returncode, 0)
                self.assertFalse(self.trace.exists())

    def test_device_patch_is_the_reviewed_upstream_backport(self):
        text = DEVICE_PATCH.read_text()
        self.assertIn("6918066e51926427c133230ececae6154d4d70dd", text)
        self.assertIn("index 7936fb7..b9d09b7", text)
        # Only device_info.rs: no upstream profile, metadata or builder changes.
        self.assertEqual(
            [line for line in text.splitlines() if line.startswith("diff --git")],
            ["diff --git a/src/device_info.rs b/src/device_info.rs"],
        )
        # The legacy-identity test proves stored identities are never migrated.
        self.assertIn("existing_generated_identity_is_never_migrated_or_rotated", text)

    def test_failed_patched_build_still_removes_scratch(self):
        self.env["TEST_BUILD_EXIT"] = "7"
        self.assertEqual(self.run_build(self.package, "--arch", "aarch64").returncode, 7)
        source = Path(self.trace.read_text().splitlines()[0]).parents[1]
        self.assertFalse(source.exists())

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


class SymbolLookupTest(unittest.TestCase):
    def test_fake_loader_never_receives_a_global_lookup(self):
        with tempfile.TemporaryDirectory() as directory:
            executable = Path(directory) / "symbol-lookup-test"
            subprocess.run([
                "c++", "-std=c++17", "-Wall", "-Wextra", "-Werror",
                str(ROOT / "scripts/wrapper/test_symbol_lookup.cpp"), "-o", str(executable),
            ], check=True, capture_output=True, text=True)
            subprocess.run([str(executable)], check=True, capture_output=True, text=True)


class SessionRecipeTest(unittest.TestCase):
    def test_login_status_and_missing_stack_use_only_worker_exec(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            trace = root / "trace"
            docker = root / "docker"
            docker.write_text('''#!/usr/bin/env bash
if [[ "$1" == ps ]]; then
  if [[ "$*" == *"com.docker.compose.service=db"* ]]; then
    [[ "${TEST_EMPTY:-}" == 1 ]] || echo synthetic-project
  else
    [[ "$*" == *"com.docker.compose.project=synthetic-project"* ]]
    [[ "$*" == *"com.docker.compose.service=download-worker"* ]]
    [[ "${TEST_NO_WORKER:-}" == 1 ]] || echo synthetic-worker
  fi
else
  printf '%s\\n' "$*" >> "$TEST_TRACE"
fi
''')
            docker.chmod(0o755)
            op = root / "op"
            op.write_text('#!/bin/sh\necho unexpected-op-call >> "$TEST_TRACE"\nexit 1\n')
            op.chmod(0o755)
            env = {**os.environ, "PATH": f"{root}:{os.environ['PATH']}", "TEST_TRACE": str(trace)}
            def run(action):
                return subprocess.run([str(ROOT / "scripts/wrapper/session.sh"), action], env=env, capture_output=True)
            self.assertEqual(run("login").returncode, 0)
            self.assertEqual(run("status").returncode, 0)
            text = trace.read_text()
            self.assertEqual(text.splitlines(), [
                "exec -it synthetic-worker python -m worker.wrapper_cli login",
                "exec synthetic-worker python -m worker.wrapper_cli status",
            ])
            self.assertNotEqual(run("invalid").returncode, 0)
            env["TEST_NO_WORKER"] = "1"
            self.assertNotEqual(run("login").returncode, 0)
            self.assertNotEqual(run("status").returncode, 0)
            env["TEST_EMPTY"] = "1"
            self.assertNotEqual(run("status").returncode, 0)
            self.assertEqual(trace.read_text(), text, "missing containers never exec or invoke op")


if __name__ == "__main__":
    unittest.main()
