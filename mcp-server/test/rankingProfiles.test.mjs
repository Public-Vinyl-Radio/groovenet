import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const candidate = (trackId, title, ranking) => ({
  trackId,
  friendId: 6,
  simIdentity: 0.5,
  simAudio: 0.7,
  metadata: { title, artist: "A", bpm: 124, key: "8A", moodRelaxed: null, moodAggressive: null },
  ...(ranking ? { ranking } : {}),
});
const ranking = (score, passed) => ({
  score,
  passed,
  failed: passed ? [] : ["bpm_window"],
  prior: null,
  signals: {},
});
const stats = {
  identityCount: 3,
  audioCount: 3,
  unionCount: 3,
  timingMs: { identityQuery: 1, audioQuery: 1, total: 2 },
};

describe("ranking profile tools over MCP stdio (#1192)", { timeout: 15_000 }, () => {
  let client;
  let api;
  let responses;
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
        const path = req.url.split("?")[0];
        res.setHeader("Content-Type", "application/json");
        res.writeHead(200);
        res.end(JSON.stringify(responses[path]));
      });
    });
    api.listen(0, "127.0.0.1");
    await once(api, "listening");
    client = new Client({ name: "ranking-profiles-test", version: "1.0.0" });
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
    if (api?.listening) await new Promise((resolve) => api.close(resolve));
  });

  beforeEach(() => {
    requests.length = 0;
    responses = {
      "/api/ranking/profiles": {
        friend_id: 6,
        profiles: [
          { id: "default", name: "Default", kind: "preset", description: "" },
          {
            id: "beatmatcher",
            name: "Beatmatcher",
            kind: "preset",
            description: "Tempo and key first.",
          },
          { id: "17", name: "Mine", kind: "custom", description: "", invalid: true },
        ],
        active: { suggestions: "beatmatcher", related: "beatmatcher", recommendations: "default" },
      },
      "/api/ranking/active": {
        friend_id: 6,
        active: { suggestions: "selector", related: "default", recommendations: "default" },
      },
      "/api/recommendations/candidates": {
        seedTrackId: "seed",
        seedFriendId: 6,
        candidates: [
          candidate("low", "Low", ranking(0.4, true)),
          candidate("out", "Out", ranking(0.9, false)),
          candidate("high", "High", ranking(0.8, true)),
        ],
        stats,
        ranking: {
          config: "beatmatcher",
          surface: "recommendations",
          seed: { trackId: "seed", friendId: 6 },
        },
      },
    };
  });

  const text = (result) => result.content[0].text;

  it("lists the profiles and where each is active", async () => {
    const result = await client.callTool({ name: "list_ranking_profiles", arguments: {} });
    assert.equal(requests[0].url, "/api/ranking/profiles?friend_id=6");
    const out = text(result);
    assert.match(
      out,
      /• beatmatcher {2}Beatmatcher \(preset; active on suggestions, related\) — Tempo and key first\./,
    );
    assert.match(out, /• default {2}Default \(preset; active on recommendations\)/);
    assert.match(out, /• 17 {2}Mine \(custom; unreadable, ranks as Default\)/);
  });

  it("sets the active profile", async () => {
    const result = await client.callTool({
      name: "set_ranking_profile",
      arguments: { profile: "selector", surfaces: ["suggestions"], friend_id: 2 },
    });
    assert.deepEqual(requests[0], {
      method: "PUT",
      url: "/api/ranking/active",
      body: { friend_id: 2, profile_id: "selector", surfaces: ["suggestions"] },
    });
    assert.match(text(result), /suggestions: selector/);
  });

  it("refuses to set without a profile", async () => {
    const result = await client.callTool({ name: "set_ranking_profile", arguments: {} });
    assert.equal(result.isError, true);
    assert.equal(requests.length, 0);
  });

  it("ranks recommendations by a profile, best first, without constraint failures", async () => {
    const result = await client.callTool({
      name: "get_recommendations",
      arguments: { track_id: "seed", profile: "beatmatcher" },
    });
    const url = new URL(requests[0].url, "http://x");
    assert.equal(url.searchParams.get("breakdown"), "true");
    assert.equal(url.searchParams.get("ranker"), "beatmatcher");
    const out = text(result);
    assert.match(out, /Ranked by beatmatcher: 2 of 3 pass its constraints/);
    assert.ok(out.indexOf("High") < out.indexOf("Low"));
    assert.doesNotMatch(out, /Out/);
  });

  it("says when a profile fell back to Default", async () => {
    responses["/api/recommendations/candidates"].ranking.fallback = true;
    responses["/api/recommendations/candidates"].ranking.config = "17";
    const result = await client.callTool({
      name: "get_recommendations",
      arguments: { track_id: "seed", profile: "17" },
    });
    assert.match(text(result), /Ranked by 17 \(unreadable, ranked as Default\)/);
  });

  it("leaves recommendations unranked without a profile", async () => {
    const result = await client.callTool({
      name: "get_recommendations",
      arguments: { track_id: "seed" },
    });
    const url = new URL(requests[0].url, "http://x");
    assert.equal(url.searchParams.get("breakdown"), null);
    const out = text(result);
    assert.doesNotMatch(out, /Ranked by/);
    assert.ok(out.indexOf("Low") < out.indexOf("Out"));
  });
});
