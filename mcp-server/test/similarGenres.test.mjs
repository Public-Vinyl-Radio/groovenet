import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const page = {
  genre: {
    id: "8c1d7f3e-2b6a-4d59-9f0e-3a7b5c2d1e40",
    name: "Cumbia",
    slug: "cumbia",
    track_count: 412,
  },
  related: [
    {
      id: "1f6a2c9d-4e8b-4a3f-b7d1-5c0e9a8b7f62",
      name: "Salsa",
      slug: "salsa",
      track_count: 253,
      score: 1.42,
      signals: { taxonomy: "sibling", npmi: 0.42, shared_albums: 7 },
    },
  ],
};

describe("get_similar_genres over MCP stdio", { timeout: 15_000 }, () => {
  let client;
  let api;
  let response;
  let status;
  const requests = [];

  before(async () => {
    api = createServer((req, res) => {
      requests.push({
        method: req.method,
        url: req.url,
        source: req.headers["x-groovenet-client"],
      });
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
    });
    api.listen(0, "127.0.0.1");
    await once(api, "listening");
    client = new Client({ name: "similar-genres-test", version: "1.0.0" });
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
    response = page;
    status = 200;
  });

  const call = (args) => client.callTool({ name: "get_similar_genres", arguments: args });

  it("advertises its purpose and required slug with an optional positive integer limit", async () => {
    const { tools } = await client.listTools();
    const tool = tools.find((tool) => tool.name === "get_similar_genres");
    assert.match(tool.description, /playlist/);
    assert.match(tool.description, /neighbourhood/);
    assert.deepEqual(tool.inputSchema.required, ["slug"]);
    assert.equal(tool.inputSchema.properties.slug.type, "string");
    assert.equal(tool.inputSchema.properties.limit.type, "integer");
    assert.equal(tool.inputSchema.properties.limit.minimum, 1);
  });

  it("returns the raw API data and forwards the slug, limit, and MCP source", async () => {
    const result = await call({ slug: "cumbia/son?", limit: 3 });
    assert.ok(!result.isError);
    assert.deepEqual(JSON.parse(result.content[0].text), page);
    assert.deepEqual(requests, [
      { method: "GET", url: "/api/genres/cumbia%2Fson%3F/similar?limit=3", source: "mcp" },
    ]);
  });

  it("leaves the default limit to the API, preserving unscored fallback genres", async () => {
    const { id, name, slug, track_count } = page.related[0];
    const fallback = { id, name, slug, track_count };
    response = { ...page, related: [fallback] };
    const result = await call({ slug: "cumbia" });
    assert.deepEqual(JSON.parse(result.content[0].text), response);
    assert.equal(requests[0].url, "/api/genres/cumbia/similar");
  });

  it("preserves empty related lists", async () => {
    response = { ...page, related: [] };
    const result = await call({ slug: "cumbia" });
    assert.deepEqual(JSON.parse(result.content[0].text), response);
  });

  it("reports API failures as MCP tool errors", async () => {
    status = 404;
    response = { error: "Unknown genre: polka" };
    const result = await call({ slug: "polka" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Unknown genre: polka/);
  });

  it("rejects a missing, blank, or nonstring slug before making an API request", async () => {
    for (const args of [{}, { slug: "" }, { slug: "  " }, { slug: 12 }]) {
      const result = await call(args);
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /slug/);
    }
    assert.equal(requests.length, 0);
  });

  it("rejects invalid limits before making an API request", async () => {
    for (const limit of [0, -1, 1.5, "3", null]) {
      const result = await call({ slug: "cumbia", limit });
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /limit/);
    }
    assert.equal(requests.length, 0);
  });
});
