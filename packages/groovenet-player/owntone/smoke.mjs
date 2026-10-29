// Network-isolated engine + real adapter test. Docker is required; no speakers,
// production volumes, port publication or host packages are used.
// Build the player and engine image first, then: node owntone/smoke.mjs
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { OwnToneBackend } from "../build/ownToneBackend.js";

const exec = promisify(execFile);
const name = `groovenet-692-smoke-${process.pid}`;
const dir = mkdtempSync(join(tmpdir(), "groovenet-692-"));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const docker = (...args) =>
  execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const config = `general {
 uid = "nobody"
 db_path = "/tmp/engine/library.db"
 cache_dir = "/tmp/engine"
 logfile = "/dev/stderr"
 loglevel = log
 trusted_networks = { "localhost" }
 bind_address = "127.0.0.1"
 speaker_autoselect = no
}
library {
 name = "Groovenet 692 isolated"
 port = 13689
 directories = { "/tmp/media" }
 clear_queue_on_stop_disable = true
}
audio { type = "dummy" }
mpd { port = 0 }
`;
writeFileSync(join(dir, "engine.conf"), config);
const transport = async (input, init = {}) => {
  const args = [
    "exec",
    name,
    "curl",
    "-sS",
    "--max-time",
    "5",
    "-X",
    init.method ?? "GET",
    "-w",
    "\n%{http_code}",
  ];
  for (const [key, value] of Object.entries(init.headers ?? {}))
    args.push("-H", `${key}: ${value}`);
  if (init.body) args.push("-d", String(init.body));
  args.push(String(input));
  const { stdout } = await exec("docker", args, { signal: init.signal });
  const split = stdout.lastIndexOf("\n");
  const status = Number(stdout.slice(split + 1));
  return new Response(status === 204 ? null : stdout.slice(0, split), { status });
};
const read = async (path) => (await transport(`http://127.0.0.1:13689/api/${path}`)).json();
const put = (path) => transport(`http://127.0.0.1:13689/api/${path}`, { method: "PUT" });
const wait = async (predicate, message) => {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(100);
  }
  throw new Error(`Timed out: ${message}`);
};
let backend;
try {
  docker(
    "run",
    "-d",
    "--name",
    name,
    "--network",
    "none",
    "--mount",
    `type=bind,src=${join(dir, "engine.conf")},dst=/tmp/engine.conf,readonly`,
    "--entrypoint",
    "/bin/sh",
    "groovenet-owntone:692-test",
    "-ec",
    `
    mkdir -p /tmp/engine /tmp/media /run/dbus
    chown nobody /tmp/engine /tmp/media
    ffmpeg -y -v error -f lavfi -i 'sine=frequency=440:duration=3' -af volume=0.01 /tmp/media/short.wav
    ffmpeg -y -v error -f lavfi -i 'sine=frequency=440:duration=15' -af volume=0.01 /tmp/media/long.wav
    rm -f /run/dbus/pid /run/dbus/dbus.pid /run/avahi-daemon/pid
    dbus-uuidgen --ensure
    dbus-daemon --system --fork
    avahi-daemon --daemonize --no-drop-root
    exec /usr/sbin/owntone -f -c /tmp/engine.conf
  `,
  );
  await wait(async () => {
    try {
      return (
        (await read("search?type=tracks&expression=media_kind%20is%20music")).tracks.items
          .length === 2
      );
    } catch {
      return false;
    }
  }, "fixture index");
  const devices = await read("outputs");
  assert.equal(devices.outputs.length, 1);
  const outputId = devices.outputs[0].id;
  backend = new OwnToneBackend({
    apiUrl: "http://127.0.0.1:13689/api",
    outputId,
    fetch: transport,
    pollIntervalMs: 100,
  });
  let ended = 0;
  const errors = [];
  const positions = [];
  backend
    .on("ended", () => ended++)
    .on("error", (error) => errors.push(error))
    .on("position", (position) => positions.push(position));
  await backend.load({ url: "file:///tmp/media/short.wav" });
  await wait(() => ended === 1 || errors.length > 0, "natural completion");
  assert.deepEqual(errors, []);
  assert.equal(ended, 1);
  assert.equal((await read("player")).groovenet_terminal.reason, "eof");
  console.log("PASS: natural EOF emitted exactly once through the real adapter");
  await backend.load({ url: "file:///tmp/media/long.wav" });
  await wait(() => positions.some((p) => p > 0.1), "position progress");
  await backend.pause(true);
  await backend.seek(5);
  await backend.pause(false);
  await backend.setVolume(5);
  await put("player/stop");
  await wait(() => errors.length > 0, "explicit external stop");
  assert.equal(ended, 1);
  assert.equal(errors.at(-1).code, "PLAYBACK_INTERRUPTED");
  assert.equal((await read("player")).groovenet_terminal.reason, "interrupted");
  console.log("PASS: external stop does not advance; pause/resume/absolute seek/volume accepted");
  errors.length = 0;
  await backend.load({ url: "file:///tmp/media/long.wav" });
  await put("queue/clear");
  await wait(() => errors.length > 0, "external queue replacement");
  assert.equal(ended, 1);
  assert.equal(errors.at(-1).code, "PLAYBACK_INTERRUPTED");
  console.log("PASS: external queue replacement does not advance");
  await backend.close();
  backend = undefined;
  // Restart the same container: its DB survives, but its signal epoch must not.
  const beforeRestart = (await read("player")).groovenet_terminal.instance;
  backend = new OwnToneBackend({
    apiUrl: "http://127.0.0.1:13689/api",
    outputId,
    fetch: transport,
    pollIntervalMs: 100,
  });
  let restartEnded = 0;
  const restartErrors = [];
  backend.on("ended", () => restartEnded++).on("error", (error) => restartErrors.push(error));
  await backend.load({ url: "file:///tmp/media/long.wav" });
  docker("restart", name);
  await wait(async () => {
    try {
      return (await read("player")).groovenet_terminal.instance !== beforeRestart;
    } catch {
      return false;
    }
  }, "new engine epoch");
  await wait(
    () => restartErrors.some((error) => error.code === "PLAYBACK_INTERRUPTED"),
    "restart reconciliation",
  );
  assert.equal(restartEnded, 0);
  assert.equal((await read("player")).state, "stop");
  console.log("PASS: engine restart changes epoch and never replays or advances");
  await backend.close();
  backend = undefined;
  console.log("PASS: isolated smoke complete (dummy output only; no audible hardware validation)");
} catch (error) {
  try {
    execFileSync("docker", ["logs", "--tail", "50", name], { stdio: "inherit" });
  } catch {
    /* not started */
  }
  throw error;
} finally {
  await backend?.close().catch(() => {});
  try {
    docker("rm", "-f", name);
  } catch {
    /* already gone */
  }
  rmSync(dir, { recursive: true, force: true });
}
