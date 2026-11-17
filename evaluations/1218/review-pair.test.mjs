import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSideBySide } from "../1196/side-by-side.mjs";
import {
  AFTER,
  AFTER_2,
  BEFORE,
  freezeSample,
  freezeSecondSample,
  HOLDOUT_SEEDS_SHA256,
  loadSample,
  pairResults,
  REVIEW_2_SEEDS_SHA256,
  REVIEW_SEEDS_SHA256,
  seedKeys,
  serialize,
} from "./review-pair.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const holdout = readFileSync(join(HERE, "../1196/seeds-holdout.json"), "utf8");
const committed = readFileSync(join(HERE, "review-seeds.json"), "utf8");
const committed2 = readFileSync(join(HERE, "review-seeds-2.json"), "utf8");

test("the committed sample re-derives byte for byte from the holdout seeds", () => {
  assert.equal(serialize(freezeSample(holdout)), committed);
  const sample = loadSample(committed);
  assert.equal(sample.keys.length, 20);
  assert.equal(new Set(sample.keys).size, 20);
  assert.equal(sample.seeds_sha256, HOLDOUT_SEEDS_SHA256);
});

test("the sample is drawn from the holdout keys, which the #1196 review never showed", () => {
  const keys = new Set(seedKeys(JSON.parse(holdout)));
  const frozen = new Set(
    seedKeys(JSON.parse(readFileSync(join(HERE, "../1196/seeds.json"), "utf8"))),
  );
  for (const key of loadSample(committed).keys) {
    assert.ok(keys.has(key));
    assert.ok(!frozen.has(key));
  }
});

test("round 2 re-derives from the holdout keys round 1 did not show", () => {
  assert.equal(serialize(freezeSecondSample(holdout, loadSample(committed))), committed2);
  const second = loadSample(committed2, REVIEW_2_SEEDS_SHA256);
  const first = new Set(loadSample(committed).keys);
  assert.equal(second.keys.length, 19);
  assert.equal(new Set(second.keys).size, 19);
  assert.ok(second.keys.every((key) => !first.has(key)));
  assert.equal(first.size + second.keys.length, seedKeys(JSON.parse(holdout)).length);
  assert.throws(() => freezeSecondSample(holdout + " ", { keys: [] }), /Holdout seeds hash/);
  assert.throws(
    () => freezeSecondSample(holdout, { seeds_sha256: "x", keys: [] }),
    /Round 1 is not over/,
  );
  assert.throws(() => loadSample(committed2 + " ", REVIEW_2_SEEDS_SHA256), /Review seeds hash/);
});

test("a changed seeds file or sample is refused", () => {
  assert.throws(() => freezeSample(holdout + " "), /Holdout seeds hash/);
  assert.throws(() => loadSample(committed + " "), /Review seeds hash/);
  assert.throws(() => loadSample(committed, null), /No frozen review sample/);
  assert.equal(createHash("sha256").update(committed).digest("hex"), REVIEW_SEEDS_SHA256);
});

test("seed keys follow run.mjs: tracks by friend and id, playlists by id", () => {
  assert.deepEqual(
    seedKeys({
      tracks: [{ friend_id: 6, track_id: "1-A" }],
      playlists: [{ playlist_id: 51, friend_id: 6 }],
    }),
    ["6:1-A", "playlist:51"],
  );
});

const pick = (id) => ({ track_id: id, friend_id: 6, title: id, artist: id, album: id });
const run = (sha, lists) => ({
  kind: "1196-results",
  schema_version: 1,
  seeds_sha256: sha,
  seeds: Object.entries(lists).map(([key, picks]) => ({
    key,
    kind: "track",
    seed: pick(key.split(":")[1]),
    lists: { selector: { picks: picks.map(pick) }, default: { picks: [] } },
  })),
});

test("pairs the two runs' Selector lists for the sampled seeds only", () => {
  const sample = { seeds_sha256: "s", keys: ["6:b", "6:a"] };
  const before = run("s", { "6:a": ["x", "y"], "6:b": ["p"], "6:c": ["q"] });
  const after = run("s", { "6:a": ["y", "z"], "6:b": ["p"], "6:c": ["r"] });
  const paired = pairResults(before, after, sample);
  assert.deepEqual(
    paired.seeds.map((s) => s.key),
    ["6:b", "6:a"],
  );
  assert.deepEqual(paired.profiles, [BEFORE, AFTER]);
  const a = paired.seeds[1];
  assert.deepEqual(Object.keys(a.lists), [BEFORE, AFTER]);
  assert.deepEqual(
    a.lists[BEFORE].picks.map((p) => p.track_id),
    ["x", "y"],
  );
  assert.deepEqual(
    a.lists[AFTER].picks.map((p) => p.track_id),
    ["y", "z"],
  );
  // The sheet builder takes it as it is: an identical pair is an automatic tie.
  const { sheet, key } = buildSideBySide(paired, { a: BEFORE, b: AFTER, sample: 2 });
  assert.equal(sheet.items.length, 1);
  assert.deepEqual(key.auto_ties, ["6:b"]);
  assert.ok(!JSON.stringify(sheet).includes("selector"));
});

test("round 2 names the new list selector-fallback", () => {
  const sample = { seeds_sha256: "s", keys: ["6:a"] };
  const paired = pairResults(
    run("s", { "6:a": ["x"] }),
    run("s", { "6:a": ["y"] }),
    sample,
    undefined,
    AFTER_2,
  );
  assert.deepEqual(paired.profiles, [BEFORE, AFTER_2]);
  assert.deepEqual(Object.keys(paired.seeds[0].lists), [BEFORE, AFTER_2]);
});

test("refuses runs over other seeds, or a seed missing a list", () => {
  const sample = { seeds_sha256: "s", keys: ["6:a"] };
  const ok = run("s", { "6:a": ["x"] });
  assert.throws(() => pairResults(run("t", { "6:a": ["x"] }), ok, sample), /before results/);
  assert.throws(() => pairResults(ok, run("t", { "6:a": ["x"] }), sample), /after results/);
  assert.throws(() => pairResults(ok, run("s", { "6:b": ["x"] }), sample), /no selector list/);
});
