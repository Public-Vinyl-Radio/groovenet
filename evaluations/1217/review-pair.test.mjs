import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSideBySide } from "../1196/side-by-side.mjs";
import { SEEDS_SHA256 } from "../1196/seeds.mjs";
import { seedKeys } from "../1218/review-pair.mjs";
import {
  AFTER,
  BEFORE,
  freezeSample,
  loadSample,
  pairResults,
  REVIEW_SEEDS_SHA256,
  serialize,
} from "./review-pair.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const frozen = readFileSync(join(HERE, "../1196/seeds.json"), "utf8");
const committed = readFileSync(join(HERE, "review-seeds.json"), "utf8");
const keys = seedKeys(JSON.parse(frozen));

/** #1196's review as side-by-side.mjs built it: 20 of the frozen seeds' keys. */
function shownIn1196() {
  const results = {
    seeds_sha256: SEEDS_SHA256,
    seeds: keys.map((key) => ({
      key,
      kind: "track",
      seed: {},
      // Different lists, so none is an automatic tie and every chosen seed shows.
      lists: { beatmatcher: { picks: [{ track_id: "x" }] }, selector: { picks: [] } },
    })),
  };
  const { key } = buildSideBySide(results);
  return new Set(Object.values(key.items).map((item) => item.seed));
}

test("the committed sample re-derives byte for byte from the frozen seeds", () => {
  assert.equal(serialize(freezeSample(frozen)), committed);
  const sample = loadSample(committed);
  assert.equal(sample.seeds_sha256, SEEDS_SHA256);
  assert.equal(sample.keys.length, 19);
  assert.equal(new Set(sample.keys).size, 19);
});

test("the sample is every frozen seed the #1196 review did not show", () => {
  const shown = shownIn1196();
  assert.equal(shown.size, 20);
  const sample = loadSample(committed).keys;
  assert.ok(sample.every((key) => keys.includes(key) && !shown.has(key)));
  assert.equal(shown.size + sample.length, keys.length);
  // And none of the holdout seeds, which #1218's two rounds showed.
  const holdout = new Set(
    seedKeys(JSON.parse(readFileSync(join(HERE, "../1196/seeds-holdout.json"), "utf8"))),
  );
  assert.ok(sample.every((key) => !holdout.has(key)));
});

test("a changed seeds file or sample is refused", () => {
  assert.throws(() => freezeSample(frozen + " "), /Frozen seeds hash/);
  assert.throws(() => loadSample(committed + " "), /Review seeds hash/);
  assert.throws(() => loadSample(committed, null), /No frozen review sample/);
  assert.equal(loadSample(committed, REVIEW_SEEDS_SHA256).kind, "1217-review-seeds");
});

const run = (profile, keysWithLists, sha = SEEDS_SHA256) => ({
  kind: "1196-results",
  schema_version: 1,
  seeds_sha256: sha,
  seeds: keysWithLists.map((key) => ({
    key,
    kind: "track",
    seed: { track_id: key },
    lists: { [profile]: { picks: [{ track_id: `${profile}-${key}` }] } },
  })),
});

test("pairs main's Beatmatcher with the candidate's list for the sampled seeds only", () => {
  const sample = { seeds_sha256: SEEDS_SHA256, keys: ["k2", "k1"] };
  const paired = pairResults(
    run("beatmatcher", ["k1", "k2", "k3"]),
    run("bm-x", ["k1", "k2", "k3"]),
    sample,
    { beforeProfile: "beatmatcher", afterProfile: "bm-x" },
  );
  assert.deepEqual(paired.profiles, [BEFORE, AFTER]);
  assert.deepEqual(
    paired.seeds.map((s) => s.key),
    ["k2", "k1"],
  );
  assert.equal(paired.seeds[0].lists[BEFORE].picks[0].track_id, "beatmatcher-k2");
  assert.equal(paired.seeds[0].lists[AFTER].picks[0].track_id, "bm-x-k2");
  assert.equal(paired.seeds[0].seed.track_id, "k2");
});

test("refuses runs over other seeds, or a seed missing a list", () => {
  const sample = { seeds_sha256: SEEDS_SHA256, keys: ["k1"] };
  const names = { beforeProfile: "beatmatcher", afterProfile: "bm-x" };
  assert.throws(
    () => pairResults(run("beatmatcher", ["k1"], "other"), run("bm-x", ["k1"]), sample, names),
    /before results are not over/,
  );
  assert.throws(
    () => pairResults(run("beatmatcher", ["k1"]), run("bm-x", ["k1"], "other"), sample, names),
    /after results are not over/,
  );
  assert.throws(
    () => pairResults(run("beatmatcher", []), run("bm-x", ["k1"]), sample, names),
    /no beatmatcher list in the before run/,
  );
  assert.throws(
    () => pairResults(run("beatmatcher", ["k1"]), run("beatmatcher", ["k1"]), sample, names),
    /no bm-x list in the after run/,
  );
});
