#!/usr/bin/env python3
"""Compose hardening guardrails (#1074).

Renders `docker compose config` for every overlay combination we ship and fails
when a service breaks a rule. Rules, with the reason for each:

  published-ports  Only `app` may publish a port. Postgres, Redis and the
                   workers stay on the internal network.
  docker-socket    Nothing mounts docker.sock: that is root on the host.
  privileged       No `privileged: true`.
  no-new-privileges / cap-drop  Every service sets
                   `security_opt: [no-new-privileges:true]` and `cap_drop: [ALL]`.
                   Capabilities a service needs are added back with `cap_add`,
                   each one justified in docker-compose.yml.
  mem-limit        Every service has a memory limit, so one runaway analysis
                   cannot take the host down.

Exempt: services in the `players` profile (docker-compose.players.yml). Those
are the OwnTone/AirPlay player engines of a homelab overlay and need
`network_mode: host` for mDNS and AirPlay; the overlay is opt-in and never part
of a public deployment. They are still checked for the Docker socket and for
`privileged`.

Usage: check.py [--compose-dir DIR]
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

PUBLISHER = "app"
EXEMPT_PROFILE = "players"

# Overlay combinations. Each is a list of -f files, in order.
COMBOS: dict[str, list[str]] = {
    "base": ["docker-compose.yml"],
    "local": ["docker-compose.yml", "docker-compose.local.yml"],
    "installer": [
        "docker-compose.yml",
        "docker-compose.images.yml",
        "docker-compose.local.yml",
    ],
    "prod": ["docker-compose.yml", "docker-compose.prod.yml"],
    "worktree": [
        "docker-compose.yml",
        "docker-compose.dev.yml",
        "docker-compose.worktree.yml",
    ],
    "worktree-mac": [
        "docker-compose.yml",
        "docker-compose.dev.yml",
        "docker-compose.worktree.yml",
        "docker-compose.mac.yml",
    ],
    "prod+players": [
        "docker-compose.yml",
        "docker-compose.prod.yml",
        "docker-compose.players.yml",
    ],
}

# Dummy values for the variables compose requires, so `config` renders.
RENDER_ENV = {
    "POSTGRES_PASSWORD": "check",
    "PROD_DB_DATA_VOLUME": "db_data",
    "PROD_MUSIC_DATA_VOLUME": "music_data",
    "PROD_DB_DUMPS_VOLUME": "db_dumps",
    "PROD_DISCOGS_EXPORTS_VOLUME": "discogs_exports",
    "PROD_REDIS_DATA_VOLUME": "redis_data",
    "PROD_COOKIE_DATA_VOLUME": "cookie_data",
    "PROD_ALBUM_COVERS_VOLUME": "album_covers",
    "PROD_ESSENTIA_DATA_VOLUME": "essentia_data",
}


def render(compose_dir: Path, files: list[str]) -> dict:
    # An .env in the checkout must not change what CI renders.
    cmd = ["docker", "compose", "--project-directory", str(compose_dir)]
    cmd += ["--env-file", os.devnull]
    for f in files:
        cmd += ["-f", str(compose_dir / f)]
    cmd += ["--profile", "*", "config", "--format", "json"]
    env = {**RENDER_ENV, **os.environ}
    # docker-compose.prod.yml lists `env_file: .env`, which a fresh checkout
    # (and CI) does not have. Create an empty one for the render only.
    dotenv = compose_dir / ".env"
    created = not dotenv.exists()
    if created:
        dotenv.touch()
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, env=env, check=False)
    finally:
        if created:
            dotenv.unlink()
    if out.returncode != 0:
        raise RuntimeError(f"docker compose config failed for {files}:\n{out.stderr}")
    return json.loads(out.stdout)


def is_exempt(service: dict) -> bool:
    return EXEMPT_PROFILE in (service.get("profiles") or [])


def check_service(name: str, svc: dict) -> list[str]:
    """Return one message per rule the service breaks."""
    problems: list[str] = []

    for vol in svc.get("volumes") or []:
        source = str(vol.get("source", ""))
        if source.endswith("docker.sock"):
            problems.append(f"mounts the Docker socket ({source})")
    if svc.get("privileged"):
        problems.append("runs privileged")

    if is_exempt(svc):
        return problems

    ports = svc.get("ports") or []
    if name != PUBLISHER and ports:
        published = ", ".join(str(p.get("published") or p.get("target")) for p in ports)
        problems.append(f"publishes a port ({published}); only {PUBLISHER} may")
    if svc.get("network_mode") == "host":
        problems.append("uses network_mode: host, which publishes every port")

    if "no-new-privileges:true" not in (svc.get("security_opt") or []):
        problems.append("missing security_opt: no-new-privileges:true")
    if "ALL" not in [str(c).upper() for c in svc.get("cap_drop") or []]:
        problems.append("missing cap_drop: [ALL]")
    if not svc.get("mem_limit"):
        problems.append("missing mem_limit")
    return problems


def check_config(config: dict) -> dict[str, list[str]]:
    result = {}
    for name, svc in (config.get("services") or {}).items():
        problems = check_service(name, svc)
        if problems:
            result[name] = problems
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--compose-dir", default=str(Path(__file__).parents[2]))
    args = parser.parse_args(argv)
    compose_dir = Path(args.compose_dir)

    failed = False
    for combo, files in COMBOS.items():
        config = render(compose_dir, files)
        problems = check_config(config)
        count = len(config.get("services") or {})
        if not problems:
            print(f"ok    {combo} ({count} services)")
            continue
        failed = True
        print(f"FAIL  {combo}")
        for name, msgs in problems.items():
            for msg in msgs:
                print(f"      {name}: {msg}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
