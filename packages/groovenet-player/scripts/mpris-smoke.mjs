// Run on Linux: dbus-run-session -- node packages/groovenet-player/scripts/mpris-smoke.mjs
// Requires built workspaces, optional dbus-next dependency, dbus and playerctl.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { PlayerDaemon, PlayerCore, TrackResolver } from "../build/index.js";
import { TestPlaybackBackend } from "../build/testing.js";
import { startMpris } from "../build/mpris.js";

const dir = await mkdtemp(join(tmpdir(), "groovenet-mpris-"));
const backend = new TestPlaybackBackend();
const player = new PlayerCore(backend, new TrackResolver({}, { apiBase: "http://unused/api" }));
const paths = { socketPath: join(dir, "player.sock"), pidPath: join(dir, "player.pid") };
const daemon = new PlayerDaemon({ player, paths });
const ctl = async (...args) =>
  (await promisify(execFile)("playerctl", ["--player=groovenet", ...args])).stdout.trim();
let close;
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
  close = await startMpris(paths.socketPath);
  assert.ok(close, "MPRIS must be enabled in this session");
  assert.equal(await ctl("status"), "Stopped");
  await ctl("play");
  assert.equal(await ctl("status"), "Playing");
  assert.equal(await ctl("metadata", "xesam:title"), "First");
  assert.equal(await ctl("metadata", "xesam:artist"), "Artist");
  assert.equal(await ctl("metadata", "xesam:album"), "Album");
  await ctl("play-pause");
  assert.equal(await ctl("status"), "Paused");
  await ctl("position", "12.5");
  assert.equal(Number(await ctl("position")), 12.5);
  await ctl("position", "2+");
  assert.equal(Number(await ctl("position")), 14.5);
  await ctl("play-pause");
  assert.equal(await ctl("status"), "Playing");
  await ctl("next");
  assert.equal(await ctl("metadata", "xesam:title"), "Second");
  await ctl("previous");
  assert.equal(await ctl("metadata", "xesam:title"), "First");
  await ctl("stop");
  assert.equal(await ctl("status"), "Stopped");
  assert.equal(player.snapshot.queue.length, 2);
  await close();
  await player.play();
  assert.equal(player.snapshot.status, "playing");
  console.log("MPRIS playerctl smoke test passed.");
} finally {
  await close?.();
  await daemon.stop();
  await rm(dir, { recursive: true, force: true });
}
