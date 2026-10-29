import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

describe("search_tracks over MCP stdio", { timeout: 15_000 }, () => {
  let client;
  let api;
  let response;

  before(async () => {
    api = createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
    });
    api.listen(0, "127.0.0.1");
    await once(api, "listening");
    client = new Client({ name: "search-tracks-test", version: "1.0.0" });
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
    response = { hits: [], estimatedTotalHits: 0, offset: 0, limit: 10, processingTimeMs: 1 };
  });

  const search = async () =>
    (await client.callTool({ name: "search_tracks", arguments: { query: "x" } })).content[0].text;

  it("lists refs, duration and release after the summary", async () => {
    response.hits = [
      {
        track_id: "33416876-D2",
        friend_id: 6,
        title: "Song",
        artist: "Band",
        bpm: "120",
        key: "A minor",
        star_rating: 4,
        duration: "3:45",
        duration_seconds: 225,
        release_id: "33416876",
      },
    ];
    assert.match(
      await search(),
      /• Song - Band \(120 BPM\), A minor \[★4\] \| track_id=33416876-D2 friend_id=6 duration=3:45 release_id=33416876$/,
    );
  });

  it("formats duration_seconds in preference to the duration string", async () => {
    response.hits = [
      {
        track_id: "t",
        friend_id: 1,
        title: "T",
        artist: "A",
        duration: "9:99",
        duration_seconds: 65,
      },
    ];
    assert.match(await search(), /duration=1:05/);
  });

  it("falls back to the duration string", async () => {
    response.hits = [{ track_id: "t", friend_id: 1, title: "T", artist: "A", duration: "4:10" }];
    assert.match(await search(), /duration=4:10/);
  });

  it("omits missing duration and release", async () => {
    response.hits = [
      { track_id: "t", friend_id: 1, title: "T", artist: "A", duration: "", release_id: null },
    ];
    assert.match(await search(), /• T - A \| track_id=t friend_id=1$/m);
  });

  it("keeps a friend's friend_id", async () => {
    response.hits = [{ track_id: "t", friend_id: 42, title: "T", artist: "A" }];
    assert.match(await search(), /friend_id=42/);
  });

  it("keeps the count header and degraded note", async () => {
    response.hits = [{ track_id: "t", friend_id: 1, title: "T", artist: "A" }];
    response.estimatedTotalHits = 30;
    response.degraded = true;
    assert.match(
      await search(),
      /^Found 1 tracks \(30 total\) \(semantic search unavailable; keyword results only\):\n\n• T/,
    );
  });

  it("reports empty results", async () => {
    assert.equal(await search(), 'No tracks found matching "x".');
  });
});
