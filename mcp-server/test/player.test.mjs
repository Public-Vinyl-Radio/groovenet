import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer as createSocketServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const track = (id, extra = {}) => ({
  track_id: id,
  friend_id: 6,
  title: `Title ${id}`,
  artist: `Artist ${id}`,
  bpm: 120,
  key: "8A",
  ...extra,
});
const METHODS = [
  "status",
  "play",
  "pause",
  "resume",
  "next",
  "prev",
  "seek",
  "volume",
  "queue.add",
  "queue.addTrack",
  "queue.list",
  "queue.remove",
  "devices",
  "devices.select",
];
const entry = (id, t) => ({ id, track: t });

/** A daemon that speaks the player protocol on a unix socket and records what it saw. */
async function startFakeDaemon(socketPath) {
  const state = {
    requests: [],
    connections: 0,
    closed: 0,
    version: 1,
    mode: "normal", // normal | silent | hangup
    snapshot: {
      status: "playing",
      current: entry("e1", track("t1")),
      queue: [
        entry("e1", track("t1")),
        entry("e2", track("t2", { bpm: undefined, key: undefined })),
      ],
      position: 65.4,
      duration: 252,
      volume: 80,
      error: null,
    },
    handlers: new Map(),
  };
  const server = createSocketServer((socket) => {
    state.connections += 1;
    socket.on("close", () => {
      state.closed += 1;
    });
    socket.on("error", () => {});
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const req = JSON.parse(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        state.requests.push({ method: req.method, params: req.params });
        if (state.mode === "silent") continue;
        if (state.mode === "hangup") {
          socket.destroy();
          continue;
        }
        const base = { jsonrpc: "2.0", version: state.version, id: req.id };
        const handler = METHODS.includes(req.method) ? state.handlers.get(req.method) : undefined;
        const outcome = handler ? handler(req.params ?? {}) : { result: state.snapshot };
        socket.write(`${JSON.stringify({ ...base, ...outcome })}\n`);
      }
    });
  });
  server.listen(socketPath);
  await once(server, "listening");
  state.server = server;
  state.stop = () =>
    new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
    });
  return state;
}

describe("player tools over MCP stdio", { timeout: 30_000 }, () => {
  let dir;
  let socketPath;
  let api;
  let stored;
  let client;
  let daemon;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "gn-player-"));
    socketPath = join(dir, "player.sock");
    api = createHttpServer((req, res) => {
      req.resume();
      req.on("end", () => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(stored));
      });
    });
    api.listen(0, "127.0.0.1");
    await once(api, "listening");
    client = new Client({ name: "player-test", version: "1.0.0" });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [fileURLToPath(new URL("../build/index.js", import.meta.url))],
        env: {
          ...process.env,
          API_BASE: `http://127.0.0.1:${api.address().port}/api`,
          API_KEY: "",
          DEFAULT_FRIEND_ID: "6",
          GROOVENET_PLAYER_SOCKET: socketPath,
          GROOVENET_PLAYER_TIMEOUT_MS: "400",
        },
        stderr: "pipe",
      }),
    );
  });

  after(async () => {
    await client?.close();
    if (api?.listening) await new Promise((resolve) => api.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    stored = [track("t1"), track("t2", { friend_id: 2 })];
    daemon = await startFakeDaemon(socketPath);
  });

  afterEach(async () => {
    await daemon?.stop();
    daemon = undefined;
    await rm(socketPath, { force: true });
  });

  const call = (name, args = {}) => client.callTool({ name, arguments: args });
  const text = (result) => result.content[0].text;
  // The daemon sees the client's FIN asynchronously.
  const closedAll = async () => {
    for (let i = 0; i < 50 && daemon.closed < daemon.connections; i++)
      await new Promise((r) => setTimeout(r, 10));
    assert.equal(daemon.closed, daemon.connections);
  };

  it("registers every player tool with documented fields", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).filter((n) => n.startsWith("player_"));
    assert.deepEqual(names, [
      "player_status",
      "player_play",
      "player_pause",
      "player_resume",
      "player_next",
      "player_previous",
      "player_seek",
      "player_volume",
      "player_queue_list",
      "player_queue_add",
      "player_queue_remove",
      "player_devices",
      "player_select_device",
    ]);
    for (const tool of tools.filter((t) => t.name.startsWith("player_"))) {
      assert.ok(tool.description.length > 10, tool.name);
      for (const prop of Object.values(tool.inputSchema.properties ?? {}))
        assert.ok(prop.description, `${tool.name} field`);
    }
    const add = tools.find((t) => t.name === "player_queue_add");
    assert.deepEqual(Object.keys(add.inputSchema.properties), ["query", "playlist_id", "tracks"]);
    assert.deepEqual(add.inputSchema.properties.tracks.items.required, ["track_id"]);
  });

  it("reports status as readable text with queue indexes and entry ids", async () => {
    const result = await call("player_status");
    assert.ok(!result.isError);
    const out = text(result);
    assert.match(out, /Status: playing/);
    assert.match(out, /Current: Title t1 - Artist t1 \(120 BPM, 8A\) \| id=e1 index=0/);
    assert.match(out, /Position: 1:05 \/ 4:12/);
    assert.match(out, /Volume: 80%/);
    assert.match(out, /▶ \[0\] Title t1 - Artist t1 \(120 BPM, 8A\) \| id=e1/);
    assert.match(out, /  \[1\] Title t2 - Artist t2 \| id=e2/);
    assert.deepEqual(daemon.requests, [{ method: "status", params: undefined }]);
  });

  it("shows an idle, errored player", async () => {
    daemon.snapshot = {
      status: "error",
      current: null,
      queue: [],
      position: 0,
      duration: null,
      volume: 50,
      error: { code: "NO_AUDIO", message: "No audio for track" },
    };
    const out = text(await call("player_status"));
    assert.match(out, /Status: error/);
    assert.match(out, /Error: No audio for track/);
    assert.match(out, /Queue is empty\./);
    assert.doesNotMatch(out, /Current:/);
  });

  it("sends each transport command to the matching method", async () => {
    await call("player_play");
    await call("player_play", { index: 1 });
    await call("player_pause");
    await call("player_resume");
    await call("player_next");
    await call("player_previous");
    await call("player_seek", { seconds: 90.5 });
    await call("player_volume", { volume: 35 });
    assert.deepEqual(daemon.requests, [
      { method: "play", params: undefined },
      { method: "play", params: { index: 1 } },
      { method: "pause", params: undefined },
      { method: "resume", params: undefined },
      { method: "next", params: undefined },
      { method: "prev", params: undefined },
      { method: "seek", params: { seconds: 90.5 } },
      { method: "volume", params: { volume: 35 } },
    ]);
  });

  it("lists the queue", async () => {
    assert.match(
      text(await call("player_queue_list")),
      /Queue \(2\):\n▶ \[0\] .*id=e1\n {2}\[1\] .*id=e2/,
    );
    daemon.snapshot = { ...daemon.snapshot, queue: [], current: null };
    assert.equal(text(await call("player_queue_list")), "Queue is empty.");
  });

  it("queues a search and a playlist", async () => {
    daemon.handlers.set("queue.add", () => ({ result: [entry("e3", track("t3"))] }));
    daemon.snapshot = {
      ...daemon.snapshot,
      queue: [...daemon.snapshot.queue, entry("e3", track("t3"))],
    };
    const byQuery = text(await call("player_queue_add", { query: "cumbia" }));
    assert.match(
      byQuery,
      /Added 1 track to the queue:\n {2}\[2\] Title t3 - Artist t3 \(120 BPM, 8A\) \| id=e3/,
    );
    await call("player_queue_add", { playlist_id: 42 });
    await call("player_queue_add", { playlist_id: "p-7" });
    assert.deepEqual(
      daemon.requests.filter((r) => r.method === "queue.add").map((r) => r.params),
      [{ query: "cumbia" }, { playlistId: 42 }, { playlistId: "p-7" }],
    );
    daemon.handlers.set("queue.add", () => ({ result: [] }));
    assert.match(
      text(await call("player_queue_add", { query: "nothing" })),
      /No tracks were added/,
    );
  });

  it("hydrates track refs from search_tracks and queues them in order", async () => {
    daemon.handlers.set("queue.addTrack", (p) => ({
      result: [entry(`n-${p.track.track_id}`, p.track)],
    }));
    const result = await call("player_queue_add", {
      tracks: [{ track_id: "t1" }, { track_id: "t2", friend_id: 2 }],
    });
    assert.ok(!result.isError, text(result));
    assert.match(text(result), /Added 2 tracks/);
    assert.match(text(result), /id=n-t1/);
    const added = daemon.requests.filter((r) => r.method === "queue.addTrack");
    assert.deepEqual(
      added.map((r) => [r.params.track.track_id, r.params.track.friend_id, r.params.track.title]),
      [
        ["t1", 6, "Title t1"],
        ["t2", 2, "Title t2"],
      ],
    );
    assert.equal(daemon.connections, 1);
  });

  it("rejects unresolvable track refs without touching the daemon", async () => {
    const bad = await call("player_queue_add", { tracks: [{ id: 5 }] });
    assert.ok(bad.isError);
    assert.match(text(bad), /tracks\[0\] is missing `track_id`.*numeric database ID/);
    const missing = await call("player_queue_add", { tracks: [{ track_id: "nope" }] });
    assert.match(text(missing), /Tracks not found: nope \(friend_id 6\)/);
    assert.ok((await call("player_queue_add", { tracks: [] })).isError);
    assert.equal(daemon.connections, 0);
  });

  it("removes by id or index", async () => {
    daemon.handlers.set("queue.remove", (p) => ({ result: entry(p.id ?? "e2", track("t2")) }));
    assert.match(
      text(await call("player_queue_remove", { id: "e2" })),
      /Removed from the queue: Title t2 - Artist t2 \(120 BPM, 8A\) \| id=e2/,
    );
    await call("player_queue_remove", { index: 0 });
    assert.deepEqual(
      daemon.requests.map((r) => r.params),
      [{ id: "e2" }, { index: 0 }],
    );
  });

  it("lists devices and selects one", async () => {
    const devices = [
      { id: "coreaudio/abc", name: "Headphones", description: "USB DAC" },
      { id: "auto", name: "Auto" },
    ];
    daemon.handlers.set("devices", () => ({ result: devices }));
    daemon.handlers.set("devices.select", () => ({ result: devices }));
    assert.match(
      text(await call("player_devices")),
      /Audio devices \(2\):\n• Headphones — USB DAC \| id=coreaudio\/abc\n• Auto \| id=auto/,
    );
    assert.match(
      text(await call("player_select_device", { device_id: "auto" })),
      /^Selected audio device auto\.\nAudio devices \(2\)/,
    );
    assert.deepEqual(daemon.requests[1], { method: "devices.select", params: { id: "auto" } });
    daemon.handlers.set("devices", () => ({ result: [] }));
    assert.equal(text(await call("player_devices")), "No audio output devices reported.");
  });

  it("validates arguments before connecting", async () => {
    const cases = [
      ["player_play", { index: -1 }, /index must be a non-negative integer/],
      ["player_play", { index: 1.5 }, /index must be a non-negative integer/],
      ["player_seek", {}, /seconds must be a number >= 0/],
      ["player_seek", { seconds: -3 }, /seconds must be a number >= 0/],
      ["player_volume", { volume: 101 }, /volume must be a number from 0 to 100/],
      ["player_volume", { volume: "loud" }, /volume must be a number from 0 to 100/],
      ["player_queue_add", {}, /exactly one of query, playlist_id or tracks/],
      [
        "player_queue_add",
        { query: "a", playlist_id: "1" },
        /exactly one of query, playlist_id or tracks/,
      ],
      ["player_queue_add", { query: "  " }, /query must be a nonempty string/],
      [
        "player_queue_add",
        { playlist_id: "" },
        /playlist_id must be a nonempty string or a number/,
      ],
      ["player_queue_add", { tracks: "t1" }, /tracks must be an array/],
      ["player_queue_remove", {}, /exactly one of id or index/],
      ["player_queue_remove", { id: "e1", index: 0 }, /exactly one of id or index/],
      ["player_queue_remove", { index: -1 }, /index must be a non-negative integer/],
      ["player_queue_remove", { id: " " }, /id must be a nonempty string/],
      ["player_select_device", {}, /device_id must be a nonempty string/],
    ];
    for (const [name, args, pattern] of cases) {
      const result = await call(name, args);
      assert.ok(result.isError, `${name} ${JSON.stringify(args)}`);
      assert.match(text(result), pattern);
    }
    assert.equal(daemon.connections, 0);
  });

  it("surfaces daemon error responses with their code", async () => {
    daemon.handlers.set("play", () => ({
      error: {
        code: "INVALID_ARGUMENT",
        message: "The playback queue is empty or the index is out of range",
      },
    }));
    const result = await call("player_play", { index: 9 });
    assert.ok(result.isError);
    assert.match(
      text(result),
      /Player daemon error \(INVALID_ARGUMENT\): The playback queue is empty/,
    );
  });

  it("explains a version mismatch", async () => {
    daemon.version = 2;
    const wrongVersion = await call("player_status");
    assert.ok(wrongVersion.isError);
    assert.match(
      text(wrongVersion),
      /version mismatch.*daemon version 2, client version 1.*Update the MCP server/s,
    );

    daemon.version = 1;
    daemon.handlers.set("status", () => ({
      error: {
        code: "VERSION_MISMATCH",
        message: "Unsupported player protocol version 1; this daemon supports version 3.",
      },
    }));
    assert.match(
      text(await call("player_status")),
      /version mismatch: Unsupported player protocol version 1/,
    );
  });

  it("tells the user to start the daemon when none is running or the socket is stale", async () => {
    await daemon.stop();
    daemon = undefined;
    await rm(socketPath, { force: true });
    const none = await call("player_status");
    assert.ok(none.isError);
    assert.match(
      text(none),
      /player daemon is not running.*groovenet player start --detach.*never starts the daemon/s,
    );
    assert.ok(text(none).includes(socketPath));

    // A leftover file where the socket used to be refuses connections.
    await writeFile(socketPath, "");
    assert.match(text(await call("player_pause")), /not running.*groovenet player start --detach/s);
    await rm(socketPath, { force: true });
    daemon = await startFakeDaemon(socketPath);
  });

  it("times out on a silent daemon and does not leak the connection", async () => {
    daemon.mode = "silent";
    const started = Date.now();
    const result = await call("player_status");
    assert.ok(result.isError);
    assert.match(text(result), /did not answer in time/);
    assert.ok(Date.now() - started < 3000);
    await closedAll();
  });

  it("reports a daemon that hangs up mid-request", async () => {
    daemon.mode = "hangup";
    const result = await call("player_next");
    assert.ok(result.isError);
    assert.match(text(result), /closed the connection.*groovenet player start --detach/s);
    await closedAll();
  });

  it("opens one connection per call and closes it, on success and failure", async () => {
    await call("player_status");
    await call("player_queue_list");
    daemon.handlers.set("pause", () => ({ error: { code: "PLAYER_ERROR", message: "boom" } }));
    await call("player_pause");
    assert.equal(daemon.connections, 3);
    await closedAll();
  });
});

describe("player socket path default", () => {
  it("falls back to ~/.groovenet/player/player.sock", async () => {
    const home = await mkdtemp(join(tmpdir(), "gn-home-"));
    const c = new Client({ name: "player-default-test", version: "1.0.0" });
    await c.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [fileURLToPath(new URL("../build/index.js", import.meta.url))],
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          GROOVENET_PLAYER_SOCKET: "",
          API_BASE: "http://127.0.0.1:9/api",
        },
        stderr: "pipe",
      }),
    );
    try {
      const result = await c.callTool({ name: "player_status", arguments: {} });
      assert.ok(result.isError);
      assert.ok(
        result.content[0].text.includes(join(home, ".groovenet", "player", "player.sock")),
        result.content[0].text,
      );
    } finally {
      await c.close();
      await rm(home, { recursive: true, force: true });
    }
  });
});
