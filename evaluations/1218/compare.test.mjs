import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listExtras,
  poolSpread,
  profileRun,
  quantile,
  sourceOf,
  stability,
  summarise,
} from "./compare.mjs";

test("a candidate's source is the index that gave it a similarity", () => {
  assert.equal(sourceOf({ simIdentity: 0.8, simAudio: 0.99 }), "both");
  assert.equal(sourceOf({ simIdentity: 0.8, simAudio: null }), "identity");
  assert.equal(sourceOf({ simIdentity: null, simAudio: 0.99 }), "vibe");
  assert.equal(sourceOf({}), "none");
  assert.equal(sourceOf(undefined), "none");
});

test("extras: same-key share over known keys, and the share of picks by source", () => {
  const picks = [
    { track_id: "a", friend_id: 6, key_relation: "same" },
    { track_id: "b", friend_id: 6, key_relation: "adjacent" },
    { track_id: "c", friend_id: 6, key_relation: null },
    { track_id: "d", friend_id: 6, key_relation: "same" },
  ];
  const candidates = [
    { trackId: "a", friendId: 6, simIdentity: 0.8, simAudio: null },
    { trackId: "b", friendId: 6, simIdentity: 0.8, simAudio: 0.99 },
    { trackId: "c", friendId: 6, simIdentity: null, simAudio: 0.99 },
  ];
  assert.deepEqual(listExtras(picks, candidates), {
    same_key: 2 / 3,
    identity_only: 0.25,
    vibe_only: 0.25,
    both: 0.25,
  });
  assert.deepEqual(listExtras([]), {
    same_key: null,
    identity_only: null,
    vibe_only: null,
    both: null,
  });
});

test("quantiles interpolate between ranks", () => {
  assert.equal(quantile([], 0.5), null);
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(quantile([1, 2, 3, 4], 0), 1);
  assert.equal(quantile([1, 2, 3, 4], 1), 4);
});

test("pool spread shows what one outlier does to min–max", () => {
  assert.equal(poolSpread([0.5]), null);
  const even = poolSpread([0, 0.25, 0.5, 0.75, 1]);
  assert.equal(even.minmax_median, 0.5);
  // A near-duplicate at the top squeezes the rest towards 0.
  const stretched = poolSpread([0.98, 0.981, 0.982, 0.983, 0.984, 0.985, 0.986, 0.987, 0.988, 1]);
  assert.ok(stretched.minmax_median < 0.3);
  assert.equal(stretched.n, 10);
  assert.ok(Math.abs(stretched.range - 0.02) < 1e-12);
  assert.equal(poolSpread([0.7, 0.7]).minmax_median, null);
  assert.equal(poolSpread([null, 0.2, 0.4]).n, 2);
});

const seedOf = (key, picks) => ({
  key,
  kind: "track",
  seed: { track_id: key, friend_id: 6, bpm: 120, key: "8A", year: "1977", energy: 0.5 },
  lists: { selector: { picks } },
});
const p = (id, extra = {}) => ({
  track_id: id,
  friend_id: 6,
  bpm: 120,
  key_relation: "same",
  ...extra,
});

test("a profile's run and its summary use the #1196 metrics", () => {
  const ten = Array.from({ length: 10 }, (_, i) =>
    p(`t${i}`, { artist: `A${i % 5}`, year: i < 5 ? "1977" : "1985", energy: i < 5 ? 0.5 : 0.9 }),
  );
  const results = { seeds: [seedOf("s1", ten), seedOf("s2", ten.slice(0, 4))], sims: {} };
  const perSeed = profileRun(results, "selector");
  assert.equal(perSeed.length, 2);
  const summary = summarise(perSeed);
  assert.equal(summary.starved, 1);
  assert.equal(summary.within_hd, 1);
  assert.equal(summary.same_key, 1);
  assert.equal(summary.vibe, null);
  assert.equal(summary.identity_only, 0);
  assert.equal(summary.artists, (5 + 4) / 2);
  // Seed 1: half in the 1970s, half the 1980s; seed 2's four are all 1970s.
  assert.equal(summary.era_same, (0.5 + 1) / 2);
  assert.equal(summary.era_near, 1);
  assert.equal(summary.year_abs, (4 + 0) / 2);
  assert.equal(summary.era_known, 1);
  assert.equal(summary.energy_within, (0.5 + 1) / 2);
  assert.ok(Math.abs(summary.energy_abs - (0.2 + 0) / 2) < 1e-12);
  assert.equal(summary.energy_known, 1);
  // A missing list counts as an empty one.
  assert.equal(profileRun(results, "beatmatcher")[0].picks.length, 0);
});

test("stability is the mean Jaccard between the runs' lists", () => {
  const a = [{ picks: [p("x"), p("y")] }, { picks: [] }];
  const b = [{ picks: [p("y"), p("z")] }];
  assert.equal(stability(a, b), (1 / 3 + 1) / 2);
});
