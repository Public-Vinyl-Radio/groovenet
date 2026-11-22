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


class CheckConfigTest(unittest.TestCase):
    def test_collects_only_failing_services(self):
        config = {"services": {"ok": svc(), "bad": {}}}
        self.assertEqual(list(check.check_config(config)), ["bad"])

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
        self.assertEqual(self.run_main({"services": {"db": svc()}}), 0)

    def test_fails_on_violation(self):
        self.assertEqual(self.run_main({"services": {"db": {}}}), 1)


if __name__ == "__main__":
    unittest.main()
