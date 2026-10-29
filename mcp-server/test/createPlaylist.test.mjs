import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

describe("create_playlist over MCP stdio", { timeout: 15_000 }, () => {
  let client;
  let api;
  let status;
  let response;
  const requests = [];

  before(async () => {
    api = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        requests.push({
          method: req.method,
          url: req.url,
          body: body ? JSON.parse(body) : undefined,
        });
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
      });
    });
    api.listen(0, "127.0.0.1");
    await once(api, "listening");
    client = new Client({ name: "create-playlist-test", version: "1.0.0" });
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
    status = 201;
    response = { id: 1, name: "Set", created_at: "2026-01-01", tracks: [] };
  });

  const call = (args) => client.callTool({ name: "create_playlist", arguments: args });

  it("sends track ids as track objects owned by the default friend", async () => {
    const result = await call({ name: "Set", tracks: ["33416876-D2", "1-A1"] });
    assert.ok(!result.isError);
    assert.match(result.content[0].text, /Added 2 tracks/);
    assert.deepEqual(requests[0].body, {
      name: "Set",
      tracks: [
        { track_id: "33416876-D2", friend_id: 6 },
        { track_id: "1-A1", friend_id: 6 },
      ],
    });
  });

  it("uses an explicit friend_id over the default", async () => {
    await call({ name: "Set", tracks: ["t1"], friend_id: 2 });
    assert.deepEqual(requests[0].body.tracks, [{ track_id: "t1", friend_id: 2 }]);
  });

  it("creates an empty playlist without tracks", async () => {
    const result = await call({ name: "Set" });
    assert.ok(!result.isError);
    assert.deepEqual(requests[0].body, { name: "Set", tracks: [] });
  });

  it("reports an invalid payload as an MCP tool error", async () => {
    status = 400;
    response = { error: "Invalid playlist payload" };
    const result = await call({ name: "Set", tracks: ["t1"] });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Invalid playlist payload/);
  });
});
