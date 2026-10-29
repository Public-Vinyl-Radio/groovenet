import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const track = (track_id, bpm, key, duration_seconds) => ({
  track_id,
  friend_id: 1,
  title: track_id,
  artist: "Artist",
  album: "Album",
  bpm,
  key,
  duration_seconds,
});

// Playlist order is deliberately not the order the batch endpoint answers in.
const refs = ["10-A1", "20-A1", "10-A2", "10-B1", "20-A1"];
const library = [
  track("20-A1", "150", "C# minor", 300),
  track("10-B1", 128, "A minor", 120),
  track("10-A1", 120, "A minor", 180),
  track("10-A2", 124, "C major", 200),
];

describe("check_playlist over MCP stdio", { timeout: 15_000 }, () => {
  let client;
  let api;
  const requests = [];

  before(async () => {
    api = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        requests.push({
          method: req.method,
          url: req.url,
          body: body ? JSON.parse(body) : undefined,
        });
        res.writeHead(req.url === "/api/playlists/404/tracks" ? 404 : 200, {
          "Content-Type": "application/json",
        });
        if (req.url === "/api/playlists/404/tracks")
          res.end(JSON.stringify({ error: "Playlist not found" }));
        else if (req.url === "/api/playlists/7/tracks")
          res.end(
            JSON.stringify({
              playlist_id: 7,
              tracks: refs.map((track_id, position) => ({ track_id, friend_id: 1, position })),
            }),
          );
        else res.end(JSON.stringify(library));
      });
    });
    api.listen(0, "127.0.0.1");
    await once(api, "listening");
    client = new Client({ name: "check-playlist-test", version: "1.0.0" });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [fileURLToPath(new URL("../build/index.js", import.meta.url))],
        env: {
          ...process.env,
          API_BASE: `http://127.0.0.1:${api.address().port}/api`,
          API_KEY: "",
        },
        stderr: "pipe",
      }),
    );
  });

  after(async () => {
    await client?.close();
    if (api?.listening)
      await new Promise((resolve, reject) => api.close((err) => (err ? reject(err) : resolve())));
  });

  beforeEach(() => {
    requests.length = 0;
  });

  const call = (args) => client.callTool({ name: "check_playlist", arguments: args });

  it("advertises playlist_id as required and an optional non-negative threshold", async () => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "check_playlist");
    assert.match(tool.description, /side-order/);
    assert.deepEqual(tool.inputSchema.required, ["playlist_id"]);
    assert.equal(tool.inputSchema.properties.bpm_jump_threshold.type, "number");
    assert.equal(tool.inputSchema.properties.bpm_jump_threshold.minimum, 0);
  });

  it("checks the playlist in playlist order using the default threshold", async () => {
    const result = await call({ playlist_id: "7" });
    assert.ok(!result.isError);
    const check = JSON.parse(result.content[0].text);
    assert.equal(check.track_count, 5);
    assert.equal(check.total_duration_seconds, 180 + 300 + 200 + 120 + 300);
    assert.deepEqual(
      check.bpm.curve.map((p) => p.bpm),
      [120, 150, 124, 128, 150],
    );
    assert.equal(check.bpm.threshold, 8);
    assert.deepEqual(
      check.bpm.jumps.map((j) => j.to_position),
      [2, 3, 5],
    );
    // 8A -> 12A and 12A -> 8B clash; 8B -> 8A is the relative swap; 8A -> 12A again
    assert.deepEqual(
      check.keys.clashes.map((c) => [c.from_camelot, c.to_camelot]),
      [
        ["8A", "12A"],
        ["12A", "8B"],
        ["8A", "12A"],
      ],
    );
    assert.deepEqual(
      check.repeated_releases.map((r) => [r.release, r.positions]),
      [
        ["10", [1, 3, 4]],
        ["20", [2, 5]],
      ],
    );
    assert.deepEqual(check.side_order_violations, []);
    assert.equal(check.ok, false);
    assert.deepEqual(check.unresolved_track_ids, []);
    assert.deepEqual(
      requests.map((r) => `${r.method} ${r.url}`),
      ["GET /api/playlists/7/tracks", "POST /api/tracks/batch"],
    );
  });

  it("applies bpm_jump_threshold", async () => {
    const result = await call({ playlist_id: "7", bpm_jump_threshold: 40 });
    const check = JSON.parse(result.content[0].text);
    assert.equal(check.bpm.threshold, 40);
    assert.deepEqual(check.bpm.jumps, []);
  });

  it("reports API failures as MCP tool errors", async () => {
    const result = await call({ playlist_id: "404" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Playlist not found/);
  });

  it("rejects a missing, blank or nonstring playlist_id before making an API request", async () => {
    for (const args of [{}, { playlist_id: "" }, { playlist_id: "  " }, { playlist_id: 7 }]) {
      const result = await call(args);
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /playlist_id/);
    }
    assert.equal(requests.length, 0);
  });

  it("rejects an invalid threshold before making an API request", async () => {
    for (const bpm_jump_threshold of [-1, "8", null]) {
      const result = await call({ playlist_id: "7", bpm_jump_threshold });
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /bpm_jump_threshold/);
    }
    assert.equal(requests.length, 0);
  });
});
