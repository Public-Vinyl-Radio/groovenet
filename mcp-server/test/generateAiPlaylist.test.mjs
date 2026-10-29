import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

describe("generate_ai_playlist over MCP stdio", { timeout: 15_000 }, () => {
  let client;
  let api;
  let geneticStatus;
  let geneticResponse;
  let stored;
  const requests = [];

  before(async () => {
    api = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const parsed = body ? JSON.parse(body) : undefined;
        requests.push({ method: req.method, url: req.url, body: parsed });
        res.setHeader("Content-Type", "application/json");
        if (req.url === "/api/tracks/batch") {
          res.writeHead(200);
          res.end(JSON.stringify(stored));
        } else {
          res.writeHead(geneticStatus);
          res.end(JSON.stringify(geneticResponse));
        }
      });
    });
    api.listen(0, "127.0.0.1");
    await once(api, "listening");
    client = new Client({ name: "generate-ai-playlist-test", version: "1.0.0" });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [fileURLToPath(new URL("../build/index.js", import.meta.url))],
        env: {
          ...process.env,
          API_BASE: `http://127.0.0.1:${api.address().port}/api`,
          API_KEY: "",
          DEFAULT_FRIEND_ID: "6",
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
    stored = [
      { track_id: "t1", friend_id: 6, title: "One", artist: "A", bpm: 120, key: "8A" },
      { track_id: "t2", friend_id: 2, title: "Two", artist: "B", bpm: 124, key: "9A" },
    ];
    geneticStatus = 200;
    geneticResponse = { result: [stored[1], stored[0]] };
  });

  const call = (args) => client.callTool({ name: "generate_ai_playlist", arguments: args });

  it("documents the payload in the tool schema", async () => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "generate_ai_playlist");
    const item = tool.inputSchema.properties.playlist.items;
    assert.deepEqual(item.required, ["track_id"]);
    assert.ok(item.properties.friend_id && item.properties.bpm);
    assert.deepEqual(tool.inputSchema.properties.mode.enum, [
      "genetic",
      "greedy",
      "cohesive_blocks",
    ]);
  });

  it("hydrates track refs and defaults friend_id", async () => {
    const result = await call({
      playlist: [{ track_id: "t1" }, { track_id: "t2", friend_id: 2 }],
      mode: "greedy",
    });
    assert.ok(!result.isError);
    assert.match(result.content[0].text, /1\. Two - B \(124 BPM, 9A\)/);
    assert.deepEqual(requests[0].body.tracks, [
      { track_id: "t1", friend_id: 6 },
      { track_id: "t2", friend_id: 2 },
    ]);
    const sent = requests[1].body;
    assert.equal(sent.mode, "greedy");
    assert.deepEqual(
      sent.playlist.map((t) => [t.track_id, t.friend_id, t.bpm]),
      [
        ["t1", 6, 120],
        ["t2", 2, 124],
      ],
    );
  });

  it("lets caller-supplied fields override stored ones", async () => {
    await call({ playlist: [{ track_id: "t1", bpm: 100 }] });
    assert.equal(requests[1].body.playlist[0].bpm, 100);
    assert.equal(requests[1].body.mode, undefined);
  });

  it("rejects an item with `id` but no `track_id`, without calling the API", async () => {
    const result = await call({ playlist: [{ id: 42, title: "One" }] });
    assert.equal(result.isError, true);
    assert.match(
      result.content[0].text,
      /playlist\[0\] is missing `track_id`.*numeric database ID/,
    );
    assert.equal(requests.length, 0);
  });

  it("rejects an item with neither `track_id` nor `id`", async () => {
    const result = await call({ playlist: [{ title: "One" }] });
    assert.equal(result.isError, true);
    assert.match(
      result.content[0].text,
      /playlist\[0\] is missing `track_id` \(non-empty string\)\.$/,
    );
  });

  it("rejects an unknown mode", async () => {
    const result = await call({ playlist: [{ track_id: "t1" }], mode: "random" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /mode must be one of genetic, greedy, cohesive_blocks/);
  });

  it("rejects an empty playlist", async () => {
    const result = await call({ playlist: [] });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /at least one track/);
    assert.equal(requests.length, 0);
  });

  it("names tracks that cannot be found", async () => {
    const result = await call({ playlist: [{ track_id: "t1" }, { track_id: "nope" }] });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Tracks not found: nope \(friend_id 6\)/);
    assert.equal(requests.length, 1);
  });

  it("surfaces the server's invalid-track details", async () => {
    geneticStatus = 400;
    geneticResponse = {
      error: "Some tracks are missing required data (embedding or bpm).",
      invalid: [{ track_id: "t1", reason: "missing_embedding" }],
      invalid_count: 1,
    };
    const result = await call({ playlist: [{ track_id: "t1" }] });
    assert.equal(result.isError, true);
    assert.match(
      result.content[0].text,
      /missing required data.*"track_id":"t1","reason":"missing_embedding"/,
    );
  });

  it("surfaces the server's validation details", async () => {
    geneticStatus = 400;
    geneticResponse = {
      error: "Invalid playlist payload",
      details: { fieldErrors: { mode: ["Invalid option"] } },
    };
    const result = await call({ playlist: [{ track_id: "t1" }] });
    assert.match(result.content[0].text, /Invalid playlist payload.*"mode":\["Invalid option"\]/);
  });
});
