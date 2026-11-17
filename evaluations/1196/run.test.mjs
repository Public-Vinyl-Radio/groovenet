import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rankingConfigFor } from "./configs.mjs";
import {
  candidatesBody,
  MODES,
  orderingPool,
  PROFILES,
  profileDraft,
  seedOf,
  similaritySql,
} from "./run.mjs";
import { api, assertLocalUrl, parseEnv, psqlJson, worktreeEnv } from "./stack.mjs";

test("every preset and built-in config is run, in every optimiser mode", () => {
  assert.deepEqual(PROFILES, ["default", "beatmatcher", "selector", "blend", "mixable", "strict"]);
  assert.deepEqual(MODES, ["greedy", "genetic", "cohesive_blocks"]);
});

test("a preset goes as ranker=, an inline config as ranking_config", () => {
  const tracks = [{ track_id: "1-A", friend_id: 6, title: "dropped" }];
  assert.deepEqual(candidatesBody(tracks, { id: "selector" }, 6), {
    tracks: [{ track_id: "1-A", friend_id: 6 }],
    breakdown: true,
    scope: "library",
    library_friend_id: 6,
    ranker: "selector",
  });
  const config = { version: 1, id: "x" };
  const body = candidatesBody(tracks, { id: "x", config }, 6);
  assert.equal(body.ranking_config, config);
  assert.equal(body.ranker, undefined);
});

test("the similarity query escapes ids and dedupes in SQL", () => {
  assert.equal(similaritySql([]), "SELECT '{}'::json");
  const sql = similaritySql([
    [
      { track_id: "o'brien", friend_id: 6 },
      { track_id: "2-B", friend_id: "6" },
    ],
  ]);
  assert.match(sql, /\('o''brien', 6, '2-B', 6\)/);
  assert.match(sql, /SELECT DISTINCT \* FROM pairs/);
  assert.match(sql, /serving_template_version = x.template_version/);
});

test("an inline config is stored as a temporary playlists-only draft", () => {
  const config = {
    version: 2,
    id: "lean",
    weights: { vibe_similarity: 10 },
    usePrior: true,
    constraints: {},
  };
  assert.deepEqual(profileDraft({ id: "lean", config }), {
    version: 2,
    name: "eval-1196 lean",
    description: "Temporary #1196 evaluation profile; deleted after the run.",
    surfaces: ["playlists"],
    weights: { vibe_similarity: 10 },
    usePrior: true,
    constraints: {},
  });
  const based = profileDraft({
    id: "x".repeat(90),
    config: { ...config, base: { combine: "max", signals: [] } },
  });
  assert.equal(based.name.length, 80);
  assert.deepEqual(based.base, { combine: "max", signals: [] });
});

test("the ordering pool keeps tracks with a BPM and a vector, in order", () => {
  const pool = orderingPool([
    { track_id: "a", bpm: 120, _vectors: { default: [1] } },
    { track_id: "b", bpm: null, _vectors: { default: [1] } },
    { track_id: "c", bpm: "0", _vectors: { default: [1] } },
    { track_id: "d", bpm: "98.5" },
    { track_id: "e", bpm: "98.5", _vectors: { default: [0, 1] } },
  ]);
  assert.deepEqual(
    pool.map((t) => t.track_id),
    ["a", "e"],
  );
});

test("seedOf keeps only the fields the metrics and sheet need", () => {
  assert.deepEqual(
    seedOf({ track_id: "a", friend_id: 6, bpm: 120, notes: "private", embedding: [1] }),
    {
      track_id: "a",
      friend_id: 6,
      title: "",
      artist: "",
      album: "",
      year: null,
      styles: [],
      bpm: 120,
      key: null,
    },
  );
});

test("proposed configs parse with the contracts' own schemas", () => {
  const bare = rankingConfigFor(
    { version: 1, id: "ignored", weights: { vibe_similarity: 1 }, usePrior: true, constraints: {} },
    "proposal",
  );
  assert.equal(bare.id, "proposal");
  // A #1196 (v1) proposal reads on the pool-normalised scale, like a v1 file.
  assert.equal(bare.version, 2);
  const current = rankingConfigFor({ version: 2, id: "x", weights: {} }, "now");
  assert.equal(current.version, 2);
  assert.throws(() => rankingConfigFor({ version: 3, id: "x", weights: {} }, "future"));
  const file = rankingConfigFor(
    {
      format: "groovenet-ranking-profile",
      version: 1,
      name: "P",
      description: "",
      surfaces: ["suggestions"],
      weights: { bpm_distance: 2, made_up: 1 },
      usePrior: true,
      constraints: { bpm_window: { unit: "ratio", max: 0.06, half_double: true } },
    },
    "file",
  );
  assert.deepEqual(file.weights, { bpm_distance: 2 });
  assert.equal(file.constraints.bpm_window.half_double, true);
  assert.throws(() => rankingConfigFor({ version: 1, weights: { bpm_distance: 1e9 } }, "bad"));
});

test("only loopback URLs are accepted", () => {
  assert.equal(assertLocalUrl("http://127.0.0.1:34001/x"), "http://127.0.0.1:34001");
  assert.equal(assertLocalUrl("http://localhost:3000"), "http://localhost:3000");
  assert.equal(assertLocalUrl("http://[::1]:3000"), "http://[::1]:3000");
  assert.throws(() => assertLocalUrl("https://groovenet.example.com"), /local worktree stack only/);
  assert.throws(() => assertLocalUrl("http://192.168.1.10:3000"), /local worktree stack only/);
  assert.throws(() => assertLocalUrl("file:///etc/passwd"), /local worktree stack only/);
  assert.throws(() => assertLocalUrl("not a url"), /Not a URL/);
});

test("the worktree env file names the project and the app port", () => {
  assert.deepEqual(parseEnv("# c\nA=1\nB='two'\nC=\"3\"\nlower=x\n"), { A: "1", B: "two", C: "3" });
  const dir = mkdtempSync(join(tmpdir(), "1196-env-"));
  try {
    assert.throws(() => worktreeEnv(dir), /run `just worktree-up`/);
    mkdirSync(join(dir, ".worktree"));
    writeFileSync(join(dir, ".worktree", "x.env"), "COMPOSE_PROJECT_NAME=dj-x\n");
    assert.throws(() => worktreeEnv(dir), /no COMPOSE_PROJECT_NAME or APP_PORT/);
    writeFileSync(join(dir, ".worktree", "x.env"), "COMPOSE_PROJECT_NAME=dj-x\nAPP_PORT=34001\n");
    assert.deepEqual(worktreeEnv(dir), { project: "dj-x", appUrl: "http://127.0.0.1:34001" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("SQL runs read-only in this project's db container", () => {
  const calls = [];
  const run = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    return '{"ok":1}\n';
  };
  assert.deepEqual(psqlJson("dj-x", "SELECT 1", run), { ok: 1 });
  assert.equal(calls[0].cmd, "docker");
  assert.deepEqual(calls[0].args.slice(0, 6), ["compose", "-p", "dj-x", "exec", "-T", "db"]);
  assert.match(calls[0].opts.input, /^BEGIN READ ONLY;\nSELECT 1;\nCOMMIT;/);
  assert.equal(
    psqlJson("dj-x", "SELECT 1", () => "  \n"),
    null,
  );
});

test("api posts JSON and names the path on an error", async () => {
  const seen = [];
  const fake = async (url, init) => {
    seen.push({ url, init });
    return url.endsWith("/bad")
      ? { ok: false, status: 400, text: async () => '{"error":"nope"}' }
      : { ok: true, status: 200, text: async () => '{"a":1}' };
  };
  assert.deepEqual(await api("http://127.0.0.1:1", "/x", undefined, { fetchImpl: fake }), { a: 1 });
  assert.equal(seen[0].init.method, "GET");
  await api("http://127.0.0.1:1", "/y", { b: 2 }, { fetchImpl: fake });
  assert.equal(seen[1].init.method, "POST");
  assert.equal(seen[1].init.body, '{"b":2}');
  await api("http://127.0.0.1:1", "/z", undefined, { method: "DELETE", fetchImpl: fake });
  assert.equal(seen[2].init.method, "DELETE");
  assert.equal(seen[2].init.body, undefined);
  await assert.rejects(
    api("http://127.0.0.1:1", "/bad", {}, { fetchImpl: fake }),
    /\/bad: HTTP 400 \{"error":"nope"\}/,
  );
});
