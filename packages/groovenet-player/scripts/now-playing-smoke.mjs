// Opt-in macOS lifecycle smoke test. Build workspaces and the Swift bundle first.
// Uses the real daemon and an in-memory backend; never opens an audio device.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PlayerDaemon, PlayerCore, PlayerControlClient, TrackResolver } from "../build/index.js";
import { TestPlaybackBackend } from "../build/testing.js";

assert.equal(process.platform, "darwin", "Run in a local macOS graphical login session");
const dir = await mkdtemp(join(tmpdir(), "gn-now-playing-"));
const paths = { socketPath: join(dir, "player.sock"), pidPath: join(dir, "player.pid") };
const backend = new TestPlaybackBackend();
const player = new PlayerCore(backend, new TrackResolver({}, { apiBase: "http://unused/api" }));
const daemon = new PlayerDaemon({ player, paths });
const client = new PlayerControlClient(paths.socketPath);
assert.ok(
  process.argv.length === 2 || (process.argv.length === 4 && process.argv[2] === "--helper"),
  "Usage: node now-playing-smoke.mjs [--helper /path/to/bundled/executable]",
);
const launcher = process.argv[3] ?? join(dirname(fileURLToPath(import.meta.url)), "now-playing.sh");
let child;
let stderr = "";
const children = new Set();
const waitFor = async (condition) => {
  const deadline = Date.now() + 10_000;
  while (!condition()) {
    assert.ok(Date.now() < deadline, `Companion timed out. ${stderr}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};
const launch = () => {
  stderr = "";
  const process = spawn(launcher, ["--socket", paths.socketPath], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  children.add(process);
  process.once("exit", () => children.delete(process));
  process.stderr.on("data", (data) => (stderr += data));
  process.on("error", (error) => (stderr += error.message));
  return process;
};
try {
  player.add(
    ["First", "Second"].map((title) => ({
      title,
      track_id: title,
      artist: "Artist",
      album: "Album",
      friend_id: 1,
      local_audio_url: `${title}.mp3`,
    })),
  );
  await daemon.start();
  await client.request("play");
  child = launch();
  await waitFor(() => stderr.includes("connected to") || child.exitCode !== null);
  assert.equal(child.exitCode, null, stderr);
  const duplicate = launch();
  await waitFor(() => duplicate.exitCode !== null);
  assert.equal(duplicate.exitCode, 1);
  assert.match(stderr, /Another Groovenet/);
  await client.request("pause");
  await client.request("resume");
  await client.request("next");
  assert.equal(player.snapshot.current.track.title, "Second");
  await client.request("prev");
  child.kill("SIGTERM");
  await waitFor(() => child.exitCode !== null);
  assert.equal(child.exitCode, 0);
  assert.equal(player.snapshot.status, "playing");
  assert.equal(player.snapshot.queue.length, 2);
  assert.equal((await client.request("status")).status, "playing");
  child = launch();
  await waitFor(() => stderr.includes("connected to") || child.exitCode !== null);
  assert.equal(child.exitCode, null, stderr);
  await daemon.stop();
  await waitFor(() => child.exitCode !== null);
  assert.equal(child.exitCode, 1, stderr);
  assert.match(stderr, /daemon disconnected/);
  console.log(
    "macOS companion lifecycle smoke test passed. UI/media-key verification is separate.",
  );
} finally {
  for (const process of children) process.kill("SIGTERM");
  if (children.size) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    for (const process of children) process.kill("SIGKILL");
  }
  await client.close();
  await daemon.stop();
  await rm(dir, { recursive: true, force: true });
}
