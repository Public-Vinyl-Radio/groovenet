import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import check

GOOD = {
    "security_opt": ["no-new-privileges:true"],
    "cap_drop": ["ALL"],
    "mem_limit": "100",
}


def svc(**extra):
    return {**GOOD, **extra}


class CheckServiceTest(unittest.TestCase):
    def test_hardened_service_passes(self):
        self.assertEqual(check.check_service("db", svc()), [])

    def test_app_may_publish(self):
        ports = [{"published": "3000", "target": 3000}]
        self.assertEqual(check.check_service("app", svc(ports=ports)), [])

    def test_other_service_publishing_fails(self):
        ports = [{"published": "5432", "target": 5432}]
        out = check.check_service("db", svc(ports=ports))
        self.assertEqual(len(out), 1)
        self.assertIn("5432", out[0])

    def test_unpublished_target_is_reported(self):
        out = check.check_service("db", svc(ports=[{"target": 5432}]))
        self.assertIn("5432", out[0])

    def test_host_network_fails(self):
        out = check.check_service("db", svc(network_mode="host"))
        self.assertIn("network_mode: host", out[0])

    def test_docker_socket_fails_everywhere(self):
        vol = [{"type": "bind", "source": "/var/run/docker.sock"}]
        self.assertIn("Docker socket", check.check_service("db", svc(volumes=vol))[0])
        exempt = {"profiles": ["players"], "volumes": vol}
        self.assertIn("Docker socket", check.check_service("p", exempt)[0])

    def test_named_volume_is_fine(self):
        vol = [{"type": "volume", "source": "db_data"}]
        self.assertEqual(check.check_service("db", svc(volumes=vol)), [])

    def test_privileged_fails(self):
        self.assertIn("privileged", check.check_service("db", svc(privileged=True))[0])

    def test_missing_hardening_fails(self):
        out = check.check_service("db", {})
        self.assertEqual(len(out), 3)

    def test_cap_drop_case_insensitive(self):
        self.assertEqual(check.check_service("db", svc(cap_drop=["all"])), [])

    def test_players_profile_is_exempt_from_ports_and_hardening(self):
        player = {"profiles": ["players"], "network_mode": "host", "ports": [{"target": 1}]}
        self.assertEqual(check.check_service("player-engine-a", player), [])


class UserRuleTest(unittest.TestCase):
    def dockerfile(self, text):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        path = Path(tmp.name) / "Dockerfile"
        path.write_text(text)
        return path

    def test_last_user_of_a_single_stage(self):
        path = self.dockerfile("FROM python:3\nUSER app\nCMD x\n")
        self.assertEqual(check.dockerfile_user(path, None), "app")

    def test_no_user_means_root(self):
        path = self.dockerfile("FROM python:3\nCMD x\n")
        self.assertIsNone(check.dockerfile_user(path, None))

    def test_target_stage_inherits_from_its_base_stage(self):
        path = self.dockerfile(
            "FROM node AS os\nUSER 1001\nFROM os AS base\nFROM base AS runner\nCMD x\n"
            "FROM node AS other\nCMD y\n"
        )
        self.assertEqual(check.dockerfile_user(path, "runner"), "1001")
        self.assertIsNone(check.dockerfile_user(path, "other"))

    def test_a_later_user_wins_and_root_can_be_restored(self):
        path = self.dockerfile("FROM a\nUSER app\nRUN x\nUSER root\n")
        self.assertEqual(check.dockerfile_user(path, None), "root")

    def test_from_flags_and_case(self):
        path = self.dockerfile("from --platform=linux/amd64 img as Build\nuser 7\n")
        self.assertEqual(check.dockerfile_user(path, "build"), "7")

    def test_is_root_user(self):
        for root in (None, "", "root", "0", "0:0", "root:root", " 0 "):
            self.assertTrue(check.is_root_user(root), root)
        for other in ("1001", "postgres", "1001:1001", "groovenet"):
            self.assertFalse(check.is_root_user(other), other)

    def test_compose_user_beats_dockerfile(self):
        path = self.dockerfile("FROM a\nUSER root\n")
        build = {"context": str(path.parent)}
        self.assertEqual(check.effective_user({"user": "postgres", "build": build}), "postgres")
        self.assertTrue(check.is_root_user(check.effective_user({"build": build})))

    def test_stock_image_without_user_is_root(self):
        self.assertIsNone(check.effective_user({"image": "redis"}))

    def test_service_running_as_root_fails_only_when_checked(self):
        self.assertEqual(check.check_service("db", svc()), [])
        out = check.check_service("db", svc(), check_user=True)
        self.assertIn("runs as root", out[0])

    def test_non_root_and_volume_perms_pass(self):
        self.assertEqual(check.check_service("db", svc(user="postgres"), check_user=True), [])
        self.assertEqual(check.check_service("volume-perms", svc(user="0:0"), check_user=True), [])

    def test_dockerfile_target_is_used(self):
        path = self.dockerfile("FROM a AS runner\nUSER app\nFROM a AS dev\n")
        build = {"context": str(path.parent), "target": "dev"}
        out = check.check_service("app", svc(build=build), check_user=True)
        self.assertIn("runs as root", out[0])


class CheckConfigTest(unittest.TestCase):
    def test_collects_only_failing_services(self):
        config = {"services": {"ok": svc(), "bad": {}}}
        self.assertEqual(list(check.check_config(config)), ["bad"])

    def test_user_rule_is_opt_in(self):
        config = {"services": {"db": svc()}}
        self.assertEqual(check.check_config(config), {})
        self.assertEqual(list(check.check_config(config, check_user=True)), ["db"])

    def test_empty_config(self):
        self.assertEqual(check.check_config({}), {})


class RenderTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = Path(tmp.name)

    def test_render_passes_files_and_parses_json(self):
        done = subprocess.CompletedProcess([], 0, stdout='{"services": {}}', stderr="")
        with mock.patch("subprocess.run", return_value=done) as run:
            config = check.render(self.dir, ["a.yml", "b.yml"])
        self.assertEqual(config, {"services": {}})
        cmd = run.call_args.args[0]
        self.assertEqual(cmd.count("-f"), 2)
        self.assertIn("--profile", cmd)

    def test_render_failure_raises(self):
        done = subprocess.CompletedProcess([], 1, stdout="", stderr="boom")
        with mock.patch("subprocess.run", return_value=done):
            with self.assertRaisesRegex(RuntimeError, "boom"):
                check.render(self.dir, ["a.yml"])

    def test_temporary_env_file_is_removed(self):
        seen = {}

        def fake_run(*args, **kwargs):
            seen["exists"] = (self.dir / ".env").exists()
            return subprocess.CompletedProcess([], 0, stdout="{}", stderr="")

        with mock.patch("subprocess.run", side_effect=fake_run):
            check.render(self.dir, ["a.yml"])
        self.assertTrue(seen["exists"])
        self.assertFalse((self.dir / ".env").exists())

    def test_existing_env_file_is_kept(self):
        (self.dir / ".env").write_text("A=1")
        done = subprocess.CompletedProcess([], 0, stdout="{}", stderr="")
        with mock.patch("subprocess.run", return_value=done):
            check.render(self.dir, ["a.yml"])
        self.assertEqual((self.dir / ".env").read_text(), "A=1")


class MainTest(unittest.TestCase):
    def run_main(self, config):
        with mock.patch.object(check, "render", return_value=config):
            with mock.patch("builtins.print"):
                return check.main(["--compose-dir", "/x"])

    def test_passes_on_clean_config(self):
        self.assertEqual(self.run_main({"services": {"db": svc(user="postgres")}}), 0)

    def test_dev_combos_skip_the_user_rule(self):
        seen = []

        def fake_render(_dir, files):
            seen.append(files)
            return {"services": {"app": svc()}}

        with mock.patch.object(check, "render", side_effect=fake_render):
            with mock.patch("builtins.print") as out:
                code = check.main(["--compose-dir", "/x"])
        self.assertEqual(code, 1)
        failed = [c.args[0] for c in out.call_args_list if c.args[0].startswith("FAIL")]
        self.assertFalse(any(any(d in f for d in check.DEV_COMBOS) for f in failed))
        self.assertTrue(any("base" in f for f in failed))

    def test_fails_on_violation(self):
        self.assertEqual(self.run_main({"services": {"db": {}}}), 1)


if __name__ == "__main__":
    unittest.main()
