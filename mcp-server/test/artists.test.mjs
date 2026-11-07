import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const artist = {
  id: 4,
  name: "Los Mirlos",
  sort_name: "Mirlos, Los",
  slug: "los-mirlos",
  discogs_artist_id: "321",
  is_placeholder: false,
};
const list = {
  items: [{ ...artist, album_count: 2, track_count: 5 }],
  total: 1,
  limit: 50,
  offset: 0,
  query: "mirlos",
};
const page = {
  artist,
  aliases: ["Mirlos"],
  counts: { albums: 1, appears_on: 1, tracks: 2, spins: 1, year_min: 1972, year_max: 2001 },
  albums: [
    {
      release_id: "r1",
      friend_id: 6,
      title: "Own",
      artist: "Los Mirlos",
      year: "1972",
      label: "Infopesa",
      genres: ["Latin"],
      play_count: 3,
      appears_on_tracks: 0,
      appears_on_positions: [],
    },
    {
      release_id: "26715224",
      friend_id: 6,
      title: "The Roots Of Chicha",
      artist: "Various",
      play_count: 0,
      appears_on_tracks: 1,
      appears_on_positions: ["B3"],
    },
  ],
  top_tracks: Array.from({ length: 25 }, (_, i) => ({
    track_id: `t${i}`,
    friend_id: 6,
    title: `Track ${i}`,
    artist: "Los Mirlos",
    album: "Own",
    position: "A1",
    bpm: 98,
    notes: "long notes the agent does not need",
    play_count: 25 - i,
  })),
  top_tracks_by: "spins",
  genres: [{ id: "g", name: "Chicha", slug: "chicha", track_count: 2 }],
  collaborators: [{ id: 5, name: "Juaneco Y Su Combo", slug: "juaneco", shared_credits: 2 }],
};

describe("artist tools over MCP stdio", { timeout: 15_000 }, () => {
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
      res.end(JSON.stringify(typeof response === "function" ? response(req) : response));
    });
    api.listen(0, "127.0.0.1");
    await once(api, "listening");
    client = new Client({ name: "artists-test", version: "1.0.0" });
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
    response = page;
    status = 200;
  });

  const call = (name, args) => client.callTool({ name, arguments: args });
  const json = (result) => JSON.parse(result.content[0].text);

  it("advertises the three artist tools", async () => {
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    assert.ok(byName.search_artists);
    assert.deepEqual(byName.get_artist.inputSchema.required, ["slug"]);
    assert.deepEqual(byName.get_artist_albums.inputSchema.required, ["slug"]);
    assert.equal(byName.search_artists.inputSchema.properties.limit.maximum, 200);
  });

  it("search_artists scopes to the default friend and forwards its flags", async () => {
    response = list;
    const result = await call("search_artists", { query: "mirlos" });
    assert.deepEqual(json(result), list);
    assert.deepEqual(requests, [
      { method: "GET", url: "/api/artists?q=mirlos&friend_id=6", source: "mcp" },
    ]);
    requests.length = 0;
    await call("search_artists", {
      all_friends: true,
      include_placeholders: true,
      limit: 5,
      offset: 10,
    });
    assert.equal(requests[0].url, "/api/artists?include_placeholders=true&limit=5&offset=10");
  });

  it("get_artist returns a compact page with at most 20 top tracks", async () => {
    const result = json(await call("get_artist", { slug: " los-mirlos ", friend_id: 3 }));
    assert.equal(requests[0].url, "/api/artists/los-mirlos?friend_id=3");
    assert.deepEqual(result.artist, artist);
    assert.deepEqual(result.aliases, ["Mirlos"]);
    assert.equal(result.top_tracks.length, 20);
    assert.deepEqual(result.top_tracks[0], {
      track_id: "t0",
      friend_id: 6,
      title: "Track 0",
      artist: "Los Mirlos",
      album: "Own",
      position: "A1",
      bpm: 98,
      key: null,
      play_count: 25,
    });
    assert.equal(result.albums[1].credit, "appears_on");
    assert.equal(result.albums[0].genres, undefined);
  });

  it("get_artist_albums lists credited albums then appearances", async () => {
    const result = json(await call("get_artist_albums", { slug: "los-mirlos", all_friends: true }));
    assert.equal(requests[0].url, "/api/artists/los-mirlos");
    assert.deepEqual(result.albums, [
      {
        release_id: "r1",
        friend_id: 6,
        title: "Own",
        artist: "Los Mirlos",
        year: "1972",
        label: "Infopesa",
        library_identifier: null,
        credit: "album",
        appears_on_positions: [],
        play_count: 3,
      },
      {
        release_id: "26715224",
        friend_id: 6,
        title: "The Roots Of Chicha",
        artist: "Various",
        year: null,
        label: null,
        library_identifier: null,
        credit: "appears_on",
        appears_on_positions: ["B3"],
        play_count: 0,
      },
    ]);
  });

  it("rejects a bad slug or a double scope before any request", async () => {
    for (const args of [{}, { slug: "" }, { slug: "  " }, { slug: 12 }]) {
      const result = await call("get_artist", args);
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /slug/);
    }
    const both = await call("get_artist_albums", { slug: "x", friend_id: 2, all_friends: true });
    assert.equal(both.isError, true);
    assert.match(both.content[0].text, /friend_id or all_friends/);
    assert.equal(requests.length, 0);
  });

  it("reports an unknown artist as a tool error", async () => {
    status = 404;
    response = { error: "Unknown artist: nope" };
    const result = await call("get_artist", { slug: "nope" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Unknown artist: nope/);
  });
});
