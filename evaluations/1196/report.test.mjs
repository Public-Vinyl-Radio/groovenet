import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compare,
  orderingSummary,
  orderingVerdicts,
  renderReport,
  summarize,
  verdicts,
} from "./report.mjs";

const pick = (
  id,
  {
    bpm = 120,
    rel = "same",
    artist = `art-${id}`,
    album = `al-${id}`,
    genre = 0.5,
    year = "1977",
    energy = 0.5,
  } = {},
) => ({
  track_id: id,
  friend_id: 6,
  year,
  energy,
  bpm,
  key_relation: rel,
  genre_overlap: genre,
  artist,
  album,
});

/** Beatmatcher: on tempo and key, one artist. Selector: off tempo, clashing, varied, closer vibe. */
function results() {
  const bm = ["a", "b", "c"].map((id) => pick(id, { bpm: 121, artist: "same" }));
  const sel = ["d", "e", "f"].map((id) =>
    pick(id, { bpm: 90, rel: "clash", year: "1995", energy: 0.9 }),
  );
  const def = ["a", "d"].map((id) => pick(id));
  const seeds = ["s1", "s2"].map((key) => ({
    key: `6:${key}`,
    kind: "track",
    seed: { track_id: key, friend_id: 6, bpm: 120, key: "8A", year: "1979", energy: 0.6 },
    lists: {
      default: { picks: def },
      beatmatcher: { picks: bm },
      selector: { picks: sel },
    },
  }));
  seeds.push({
    key: "playlist:1",
    kind: "playlist",
    seed: { track_id: "p", friend_id: 6, bpm: null, key: null },
    lists: { default: { picks: [] }, beatmatcher: { picks: [] }, selector: { picks: [] } },
  });
  const sims = {};
  for (const s of ["s1", "s2"]) {
    for (const id of "abc") sims[`6:${s}|6:${id}`] = { vibe: 0.5, identity: 0.6 };
    for (const id of "def") sims[`6:${s}|6:${id}`] = { vibe: 0.8, identity: 0.6 };
  }
  return {
    kind: "1196-results",
    seeds_sha256: "abc",
    generated_at: "2026-11-15T00:00:00Z",
    profiles: [
      { id: "default", half_double: false },
      { id: "beatmatcher", half_double: true },
      { id: "selector", half_double: false, source: "config" },
    ],
    seeds,
    sims,
    tracks: {
      "6:x": { bpm: 120, key: "8A" },
      "6:y": { bpm: 61, key: "8A" },
      "6:z": { bpm: 100, key: "1B" },
    },
    orderings: [
      {
        playlist: "playlist:1",
        runs: {
          beatmatcher: { greedy: [["6:x", "6:y", "6:z"]] },
          selector: {
            greedy: [["6:x", "6:z", "6:y"]],
            genetic: [
              ["6:x", "6:y"],
              ["6:y", "6:x"],
            ],
          },
        },
      },
    ],
  };
}
const vectors = { "6:x": [1, 0], "6:y": [1, 0], "6:z": [0, 1] };

test("compare uses the seeds both have, and the direction asked", () => {
  const a = [{ v: 2 }, { v: null }, { v: 4 }];
  const b = [{ v: 1 }, { v: 9 }, { v: 4 }];
  assert.deepEqual(
    [
      compare(a, b, "v", "higher").a,
      compare(a, b, "v", "higher").b,
      compare(a, b, "v", "higher").seeds,
    ],
    [3, 2.5, 2],
  );
  assert.equal(compare(a, b, "v", "higher").pass, true);
  assert.equal(compare(a, b, "v", "lower").pass, false);
  assert.equal(compare([{ v: 1 }], [{ v: 1 }], "v", "higher_or_equal").pass, true);
  assert.equal(compare([{ v: 1 }], [{ v: 1 }], "v", "higher").pass, false);
  assert.equal(compare([{}], [{}], "v", "higher").pass, null);
});

test("claims pass when the preset wins every metric, and fail on any loss", () => {
  const summary = summarize(results(), vectors);
  const [tempo, vibe] = summary.verdicts;
  assert.equal(tempo.pass, true);
  assert.deepEqual(
    tempo.tests.map((t) => t.pass),
    [true, true, true, true],
  );
  // Selector: closer vibe and more artists; releases tie (3, 3 and 0 for the empty seed), which counts.
  assert.equal(vibe.pass, true);
  assert.equal(vibe.tests.find((t) => t.path === "releases").a, 2);
  // Flip the vibe: the claim fails on that metric alone.
  const flipped = results();
  for (const k of Object.keys(flipped.sims))
    flipped.sims[k].vibe = k.endsWith("d") || k.endsWith("e") || k.endsWith("f") ? 0.1 : 0.9;
  const [, failed] = summarize(flipped, vectors).verdicts;
  assert.equal(failed.pass, false);
  assert.deepEqual(
    failed.tests.map((t) => t.pass),
    [false, true, true],
  );
  assert.equal(verdicts({ beatmatcher: [], selector: [] })[0].pass, null, "no data is undecided");
});

test("the summary counts starved seeds, overlap and the Default baseline", () => {
  const s = summarize(results(), vectors);
  assert.equal(s.profiles.beatmatcher.starved, 3);
  assert.equal(s.profiles.beatmatcher.empty, 1);
  assert.equal(s.profiles.beatmatcher.half_double, true);
  assert.equal(s.profiles.beatmatcher.metrics["bpm.within_hd"].mean, 1);
  assert.equal(s.profiles.selector.metrics["key.clash"].mean, 1);
  // Default shares one pick with each: 1/4 per track seed, 1 for the empty playlist.
  assert.ok(Math.abs(s.overlap["beatmatcher|default"] - (0.25 + 0.25 + 1) / 3) < 1e-12);
  assert.equal(s.overlap["beatmatcher|selector"], 1 / 3);
  assert.deepEqual(s.seeds, { tracks: 2, playlists: 1 });
  assert.deepEqual(
    s.against_default.map((r) => r.profile),
    ["beatmatcher", "selector"],
  );
});

test("orderings average a playlist's runs and judge the expectations", () => {
  const ordering = orderingSummary(results(), vectors);
  // Beatmatcher measures with half/double: 120 → 61 is 2 (122), 61 → 100 is 11 (50).
  assert.equal(ordering.greedy.beatmatcher.bpm_jump_native, (2 + 11) / 2);
  assert.equal(ordering.greedy.beatmatcher.bpm_jump, (59 + 39) / 2);
  assert.equal(ordering.genetic.selector.values[0].runs, 2);
  assert.equal(ordering.genetic.selector.bpm_jump, 59);
  const v = orderingVerdicts(ordering);
  assert.equal(v.length, 3, "genetic has no Beatmatcher run, so only greedy is judged");
  assert.deepEqual(
    v.map((x) => x.path),
    ["bpm_jump_hd", "key_clash", "vibe_distance"],
  );
  assert.equal(orderingSummary({ profiles: [], orderings: undefined }, {}).greedy, undefined);
});

test("the report renders verdicts, tables and overlap", () => {
  const md = renderReport(summarize(results(), vectors));
  assert.match(md, /Seeds SHA-256 `abc`/);
  assert.match(md, /Beatmatcher beats Selector on BPM and key fit \| \*\*pass\*\*/);
  assert.match(md, /\| beatmatcher \(½×\/2×\) \| 3 \| 1 \|/);
  assert.match(md, /\| selector \(proposal\) \|/);
  assert.match(md, /vibe similarity ✓ \| 0\.800 \| 0\.500 \|/);
  assert.match(md, /## Overlap/);
  assert.match(md, /\| greedy \| beatmatcher \|/);
  assert.match(md, /beatmatcher lower bpm_jump_hd than selector/);
  assert.match(md, /## Era and energy fit/);
  assert.match(md, /\| beatmatcher \| 100% \| 100% \| 2\.0 \| 100% \| 0\.100 \| 100% \| 100% \|/);
  assert.match(md, /\| selector \| 0% \| 0% \| 16\.0 \| 100% \| 0\.300 \| 0% \| 100% \|/);
  const empty = renderReport({ ...summarize(results(), vectors), ordering_verdicts: [] });
  assert.doesNotMatch(empty, /Expectation/);
});
