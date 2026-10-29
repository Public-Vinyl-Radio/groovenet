// Silent deployment regression: separate clock/engine IPC namespaces, actual
// entrypoint, and the unprivileged engine's D-Bus access. No speakers or LAN.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
const exec = promisify(execFile);
const docker = async (...args) => (await exec("docker", args)).stdout.trim();
const image = process.env.PLAYER_TEST_ENGINE_IMAGE ?? "groovenet-owntone:693-test";
const prefix = `groovenet-deployment-${process.pid}`;
const network = `${prefix}-net`,
  clock = `${prefix}-clock`,
  engine = `${prefix}-engine`;
const entrypoint = resolve("packages/groovenet-player/server/engine-entrypoint.sh");
const common = [
  "--network",
  network,
  "-e",
  "PLAYER_ENGINE_PASSWORD=test-password",
  "-e",
  "PLAYER_ENGINE_INTERFACE=eth0",
  "-e",
  "PLAYER_ENGINE_NAME=test-engine",
  "-e",
  "PLAYER_ENGINE_PORT=13689",
  "-e",
  "PLAYER_ENGINE_WS_PORT=13688",
  "-v",
  `${entrypoint}:/entrypoint.sh:ro`,
  "--entrypoint",
  "/bin/sh",
];
async function wait(predicate, message) {
  for (let i = 0; i < 100; i++) {
    try {
      if (await predicate()) return;
    } catch {
      /* container still starting */
    }
    await delay(200);
  }
  throw new Error(`Timed out: ${message}`);
}
try {
  // Check the deployable Compose configuration as well as the runtime wiring.
  const composed = JSON.parse(
    (
      await exec(
        "docker",
        [
          "compose",
          "-f",
          "docker-compose.yml",
          "-f",
          "docker-compose.players.yml",
          "--profile",
          "players",
          "config",
          "--format",
          "json",
        ],
        { env: { ...process.env, POSTGRES_PASSWORD: "test-only" } },
      )
    ).stdout,
  );
  assert.equal(composed.services["player-clock"].ipc, "shareable");
  for (const id of ["player-engine-a", "player-engine-b", "player-engine-c"]) {
    assert.equal(composed.services[id].ipc, "service:player-clock");
    assert.equal(composed.services[id].depends_on["player-clock"].condition, "service_healthy");
  }
  await docker("network", "create", "--internal", network);
  const missing = await exec("docker", ["run", "--rm", ...common, image, "/entrypoint.sh"]).then(
    () => null,
    (error) => error,
  );
  assert.ok(missing, "Engine must refuse startup without shared clock memory");
  assert.match(missing.stderr, /Shared airptpd memory is unavailable/);
  await docker(
    "run",
    "-d",
    "--name",
    clock,
    "--network",
    network,
    "--ipc",
    "shareable",
    "--entrypoint",
    "/usr/sbin/airptpd",
    image,
    "-f",
  );
  await wait(async () => {
    await docker("exec", clock, "test", "-r", "/dev/shm/airptp_shm");
    return true;
  }, "clock memory");
  await docker(
    "run",
    "-d",
    "--name",
    engine,
    ...common,
    "--ipc",
    `container:${clock}`,
    image,
    "/entrypoint.sh",
  );
  await wait(async () => {
    const status = JSON.parse(
      await docker(
        "exec",
        engine,
        "curl",
        "-fsS",
        "-u",
        "admin:test-password",
        "http://127.0.0.1:13689/api/player",
      ),
    );
    return status.state === "stop";
  }, "engine API");
  assert.equal(await docker("exec", engine, "stat", "-c", "%a", "/run/dbus"), "755");
  const bus = await docker(
    "exec",
    engine,
    "su",
    "-s",
    "/bin/sh",
    "nobody",
    "-c",
    "dbus-send --system --print-reply --dest=org.freedesktop.DBus / org.freedesktop.DBus.ListNames",
  );
  assert.match(bus, /org.freedesktop.Avahi/);
  console.log(
    "PASS: entrypoint refuses missing clock; shared IPC starts engine; nobody reaches Avahi over D-Bus",
  );
} catch (error) {
  for (const name of [clock, engine]) console.error(await docker("logs", name).catch(() => ""));
  throw error;
} finally {
  for (const name of [engine, clock]) await docker("rm", "-f", name).catch(() => {});
  await docker("network", "rm", network).catch(() => {});
}
