import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAppSpecifier } from "./app-modules.mjs";
import {
  bpmDelta,
  ENERGY_RANGE,
  eraOf,
  fitMetrics,
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
  yearOf,
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
  const fit = pickOf({
    trackId: "z",
    friendId: 6,
    metadata: { year: "1977", eraBucket: "1970s", energy: 0.42 },
  });
  assert.deepEqual([fit.era, fit.energy], ["1970s", 0.42]);
  const bare = pickOf({ trackId: "y", friendId: 6 });
  assert.deepEqual(
    [bare.bpm, bare.key, bare.key_relation, bare.genre_overlap, bare.score, bare.era, bare.energy],
    [null, null, null, null, null, null, null],
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

const fitPick = (id, extra) => ({ track_id: id, friend_id: 6, artist: id, album: id, ...extra });

test("era fit: same bucket, same or adjacent, and |Δyear| where both are known", () => {
  const seed = { year: "1975", era: "1970s" };
  const picks = [
    fitPick("a", { year: "1979", era: "1970s" }),
    fitPick("b", { year: "1983", era: "1980s" }),
    fitPick("c", { year: "1995", era: "1990s" }),
    // Era from the year alone, as a result saved before #1217 has it.
    fitPick("d", { year: "1962" }),
    fitPick("e", { year: null }),
    fitPick("f", { year: "0" }),
  ];
  const { era } = fitMetrics(seed, picks);
  assert.equal(era.known, 4);
  assert.equal(era.coverage, 4 / 6);
  assert.equal(era.same, 1 / 4);
  // 1970s, 1980s and 1960s are within one bucket; 1990s isn't.
  assert.equal(era.near, 3 / 4);
  assert.equal(era.years_known, 4);
  assert.equal(era.mean_abs_year, (4 + 8 + 20 + 13) / 4);
});

test("era fit is unknown without the seed's era, and on an empty list", () => {
  const picks = [fitPick("a", { year: "1979" })];
  const { era } = fitMetrics({ year: null }, picks);
  assert.deepEqual(
    [era.known, era.coverage, era.same, era.near, era.mean_abs_year],
    [0, 0, null, null, null],
  );
  const empty = fitMetrics({ year: "1979" }, []);
  assert.equal(empty.era.coverage, null);
  assert.equal(empty.energy.coverage, null);
  assert.equal(empty.energy.mean_abs, null);
});

test("eraOf and yearOf read the era signal's buckets", () => {
  assert.equal(eraOf({ era: "1980s", year: "1999" }), "1980s", "a stored bucket wins");
  assert.equal(eraOf({ year: 2021 }), "2020s");
  assert.equal(eraOf({ year: "1890" }), null);
  assert.equal(eraOf({}), null);
  assert.equal(yearOf({ year: "1977" }), 1977);
  assert.equal(yearOf({ year: "1899" }), null);
  assert.equal(yearOf({ year: "unknown" }), null);
  assert.equal(yearOf({}), null);
});

test("energy fit: mean |Δenergy| and the share within ±0.2, over known values", () => {
  assert.equal(ENERGY_RANGE, 0.2);
  const seed = { energy: 0.5 };
  const picks = [
    fitPick("a", { energy: 0.55 }),
    fitPick("b", { energy: 0.7 }),
    fitPick("c", { energy: 0.1 }),
    fitPick("d", { energy: null }),
    fitPick("e", {}),
  ];
  const { energy } = fitMetrics(seed, picks);
  assert.equal(energy.known, 3);
  assert.equal(energy.coverage, 3 / 5);
  assert.ok(Math.abs(energy.mean_abs - (0.05 + 0.2 + 0.4) / 3) < 1e-12);
  assert.equal(energy.within, 2 / 3, "exactly 0.2 is within");
  const noSeed = fitMetrics({ energy: null }, picks).energy;
  assert.deepEqual([noSeed.known, noSeed.mean_abs, noSeed.within], [0, null, null]);
});

test("listMetrics carries era and energy fit", () => {
  const m = listMetrics({ bpm: 120, year: "1977", energy: 0.4 }, [
    fitPick("a", { bpm: 120, year: "1977", era: "1970s", energy: 0.4 }),
  ]);
  assert.equal(m.era.same, 1);
  assert.equal(m.era.mean_abs_year, 0);
  assert.equal(m.energy.within, 1);
  assert.equal(macro([m], "energy.mean_abs").mean, 0);
});
