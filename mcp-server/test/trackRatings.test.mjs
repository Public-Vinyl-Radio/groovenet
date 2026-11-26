import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Per-profile ratings (#1283): the details show the caller's rating and the
// other profiles' by name; update_track sends the caller's rating only.
describe("track ratings over MCP stdio", { timeout: 15_000 }, () => {
  let client;
  let api;
  let track;
  const patches = [];

  before(async () => {
    api = createServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      if (req.method === "PATCH") patches.push(JSON.parse(body));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(track));
    });
    api.listen(0, "127.0.0.1");
    await once(api, "listening");
    client = new Client({ name: "track-ratings-test", version: "1.0.0" });
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

  const details = async () =>
    (await client.callTool({ name: "get_track_details", arguments: { track_id: "t1" } })).content[0]
      .text;

  it("shows your rating with the other profiles' beside it", async () => {
    track = {
      track_id: "t1",
      friend_id: 6,
      title: "Song",
      artist: "Band",
      star_rating: 5,
      other_ratings: [{ user_id: "u2", name: "Sam", rating: 3 }],
    };
    assert.match(await details(), /- Star Rating: ★5\/5 \(Sam ★3\)/);
  });

  it("says not rated for 0, and lists the others' anyway", async () => {
    track = { ...track, star_rating: 0 };
    assert.match(await details(), /- Star Rating: Not rated \(Sam ★3\)/);
    track = { ...track, other_ratings: [] };
    assert.match(await details(), /- Star Rating: Not rated$/m);
  });

  it("describes update_track's rating as the caller's own", async () => {
    const { tools } = await client.listTools();
    const update = tools.find((tool) => tool.name === "update_track");
    assert.match(update.description, /rating is your own/);
    assert.match(update.inputSchema.properties.star_rating.description, /per household profile/);
  });
});
