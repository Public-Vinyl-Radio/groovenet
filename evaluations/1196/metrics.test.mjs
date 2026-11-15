import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAppSpecifier } from "./app-modules.mjs";
import {
  bpmDelta,
  jaccard,
  listMetrics,
  macro,
  orderingPerTransition,
  paired,
  pickOf,
  read,
  releaseOf,
  topPicks,
  trackKey,
} from "./metrics.mjs";

const candidate = (
  id,
  score,
  {
    passed = true,
    album = `al-${id}`,
    artist = "A",
    bpm = 120,
    key = "8A",
    relation = "same",
    genre = 0.5,
  } = {},
) => ({
  trackId: id,
  friendId: 6,
  metadata: { title: `T${id}`, artist, album, year: "1977", styles: ["Funk"], bpm, key },
  ranking: {
    score,
    passed,
    signals: { key_relation: { value: 1, detail: relation }, genre_overlap: { value: genre } },
  },
});

test("the app's TypeScript modules resolve through the hook", () => {
  assert.match(
    resolveAppSpecifier("@/lib/mixCompat", undefined),
    /my-collection-search\/src\/lib\/mixCompat\.ts$/,
  );
  assert.equal(resolveAppSpecifier("@/lib/does-not-exist", undefined), null);
  assert.equal(resolveAppSpecifier("zod", undefined), null);
  const parent = new URL("../../my-collection-search/src/lib/ranking/ranker.ts", import.meta.url)
    .href;
  assert.match(resolveAppSpecifier("./signals", parent), /ranking\/signals\.ts$/);
  assert.equal(resolveAppSpecifier("./signals", import.meta.url), null, "only inside the app");
});

test("pickOf keeps what the metrics and the sheet read", () => {
  const p = pickOf(candidate("x", 0.4));
  assert.deepEqual(
    { id: p.track_id, bpm: p.bpm, rel: p.key_relation, genre: p.genre_overlap, year: p.year },
    { id: "x", bpm: 120, rel: "same", genre: 0.5, year: "1977" },
  );
  const bare = pickOf({ trackId: "y", friendId: 6 });
  assert.deepEqual(
    [bare.bpm, bare.key, bare.key_relation, bare.genre_overlap, bare.score],
    [null, null, null, null, null],
  );
  assert.deepEqual(bare.styles, []);
});

test("topPicks: excludes the seed, drops failures, one per release, best first", () => {
  const candidates = [
    candidate("seed", 9),
    candidate("a", 0.5),
    candidate("b", 0.9, { passed: false }),
    candidate("c", 0.7, { album: "shared" }),
    candidate("d", 0.6, { album: "shared" }),
    candidate("e", 0.5),
    {
      trackId: "f",
      friendId: 6,
      metadata: { artist: "", album: "" },
      ranking: { score: 0.1, passed: true },
    },
  ];
  const { picks, eligible, passed } = topPicks(candidates, {
    exclude: [{ track_id: "seed", friend_id: 6 }],
  });
  assert.deepEqual(
    picks.map((p) => p.track_id),
    ["c", "a", "e", "f"],
    "ties keep retrieval order",
  );
  assert.equal(eligible, 6);
  assert.equal(passed, 5);
  assert.deepEqual(
    topPicks(candidates, { k: 2 }).picks.map((p) => p.track_id),
    ["seed", "c"],
  );
  assert.deepEqual(
    topPicks(candidates, {
      cap: null,
      k: 3,
      exclude: [{ track_id: "seed", friend_id: 6 }],
    }).picks.map((p) => p.track_id),
    ["c", "d", "a"],
  );
  assert.deepEqual(topPicks([]).picks, []);
  assert.equal(releaseOf({ track_id: "z", friend_id: 6, artist: " A ", album: "X " }), "6:a:x");
  assert.equal(releaseOf({ track_id: "z", friend_id: 6 }), "z:6");
});

test("BPM: half/double counts as close only in the half/double measure", () => {
  const seed = { bpm: 124, key: "8A" };
  const doubled = {
    track_id: "p",
    friend_id: 6,
    bpm: 63,
    key_relation: "clash",
    artist: "A",
    album: "X",
  };
  assert.equal(bpmDelta(seed, doubled), 61);
  assert.equal(bpmDelta(seed, doubled, true), 2);
  assert.equal(bpmDelta({ bpm: null }, doubled), null);
  assert.equal(bpmDelta(seed, { bpm: 0 }), null, "0 BPM is unknown, as parseBpm reads it");
  const m = listMetrics(seed, [
    doubled,
    { ...doubled, track_id: "q", bpm: 126, key_relation: "adjacent" },
  ]);
  assert.equal(m.bpm.known, 2);
  assert.equal(m.bpm.mean_abs, 31.5);
  assert.equal(m.bpm.mean_abs_hd, 2);
  assert.equal(m.bpm.within, 0.5);
  assert.equal(m.bpm.within_hd, 1);
  assert.equal(m.key.compatible, 0.5);
  assert.equal(m.key.clash, 0.5);
  assert.equal(m.artists, 1);
  assert.equal(m.releases, 1);
  assert.equal(m.starved, true);
});

test("missing BPM, key, embeddings and genres are left out, never counted as misses", () => {
  const picks = [
    {
      track_id: "a",
      friend_id: 6,
      bpm: null,
      key_relation: null,
      genre_overlap: null,
      artist: "A",
      album: "1",
    },
    {
      track_id: "b",
      friend_id: 6,
      bpm: 120,
      key_relation: "relative",
      genre_overlap: 0.25,
      artist: "B",
      album: "2",
    },
  ];
  const sims = new Map([
    ["6:a", { vibe: null, identity: 0.8 }],
    ["6:b", { vibe: 0.6, identity: 0.7 }],
  ]);
  const noSeed = listMetrics({ bpm: null, key: null }, picks, sims);
  assert.equal(noSeed.bpm.known, 0);
  assert.equal(noSeed.bpm.mean_abs, null);
  assert.equal(noSeed.bpm.within, null);
  const m = listMetrics({ bpm: 120 }, picks, sims);
  assert.equal(m.bpm.known, 1);
  assert.equal(m.key.known, 1);
  assert.equal(m.key.compatible, 1);
  assert.equal(m.genre.mean, 0.25);
  assert.equal(m.vibe.known, 1);
  assert.equal(m.vibe.mean, 0.6);
  assert.ok(Math.abs(m.identity.mean - 0.75) < 1e-12);
  assert.equal(m.artists, 2);
});

test("an empty result is starved, with no values", () => {
  const m = listMetrics({ bpm: 120, key: "8A" }, []);
  assert.equal(m.picks, 0);
  assert.equal(m.starved, true);
  assert.equal(m.bpm.mean_abs, null);
  assert.equal(m.key.compatible, null);
  assert.equal(m.vibe.mean, null);
  assert.equal(m.artists, 0);
  assert.equal(macro([m], "bpm.mean_abs").seeds, 0);
  assert.equal(macro([m], "bpm.mean_abs").mean, null);
});

test("macro means, reads, overlap and paired tallies", () => {
  const rows = [{ x: { y: 1 } }, { x: { y: 3 } }, { x: { y: null } }, {}];
  assert.deepEqual(macro(rows, "x.y"), { mean: 2, seeds: 2 });
  assert.equal(read({ a: { b: 2 } }, "a.b"), 2);
  assert.equal(read({}, "a.b"), null);
  const t = (id) => ({ track_id: id, friend_id: 6 });
  assert.equal(jaccard([t("a"), t("b")], [t("b"), t("c")]), 1 / 3);
  assert.equal(jaccard([], []), 1);
  assert.equal(jaccard([t("a")], []), 0);
  assert.equal(trackKey(t("a")), "6:a");
  const a = [{ v: 1 }, { v: 2 }, { v: 3 }, { v: null }];
  const b = [{ v: 0 }, { v: 2 }, { v: 4 }, { v: 1 }];
  assert.deepEqual(paired(a, b, "v", "higher"), { wins: 1, losses: 1, ties: 1, sign_test_p: 1 });
  assert.deepEqual(paired(a, b, "v", "lower"), { wins: 1, losses: 1, ties: 1, sign_test_p: 1 });
  const many = Array.from({ length: 8 }, () => ({ v: 1 }));
  assert.ok(
    paired(
      many,
      many.map(() => ({ v: 0 })),
      "v",
    ).sign_test_p < 0.01,
  );
});

test("ordering metrics per transition come from the app's orderingMetrics", () => {
  const tracks = [
    { bpm: 124, key: "8A", embedding: [1, 0] },
    { bpm: 63, key: "3B", embedding: [0, 1] },
    { bpm: 126, key: "8A", embedding: "[1,0]" },
  ];
  const m = orderingPerTransition(tracks, { halfDouble: true });
  assert.equal(m.transitions, 2);
  assert.equal(m.bpm_jump, (61 + 63) / 2);
  assert.equal(m.bpm_jump_hd, (2 + 0) / 2);
  assert.equal(m.bpm_jump_native, m.bpm_jump_hd);
  assert.equal(m.key_clash, 1);
  assert.equal(m.vibe_distance, 1);
  assert.equal(orderingPerTransition(tracks).bpm_jump_native, m.bpm_jump);
  const one = orderingPerTransition([tracks[0]]);
  assert.equal(one.transitions, 0);
  assert.equal(one.bpm_jump, null);
});
