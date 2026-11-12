import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { playlistMates } from "../379/score.mjs";
import { chooseSeeds, scorePlaylist } from "./score.mjs";
import { baselineOf, paired, rng, scoreJudgments } from "./score-judgments.mjs";
import { sample, sheet, stratum, tally } from "./quality-sample.mjs";
import { apply, display, save } from "./review-summaries.mjs";

const t = (id, release) => ({ track_id: id, friend_id: 6, release_id: release });
const snapshot = {
  tracks: [t("a", "r1"), t("b", "r1"), t("c", "r2"), t("d", "r3")],
  playlists: [
    {
      tracks: [
        { track_id: "a", friend_id: 6 },
        { track_id: "c", friend_id: 6 },
      ],
    },
    {
      tracks: [
        { track_id: "b", friend_id: 6 },
        { track_id: "d", friend_id: 6 },
      ],
    },
  ],
};

test("seeds are stratified by lyrics and capped per stratum", () => {
  const mates = playlistMates(snapshot);
  const seeds = chooseSeeds(snapshot, mates, [true, false, true, false], 1);
  assert.equal(seeds.length, 2);
  assert.deepEqual(
    seeds.map((s) => [true, false, true, false][s.index]),
    [true, false],
  );
  assert.equal(chooseSeeds(snapshot, mates, [true, true, true, true]).length, 4);
});

test("scorePlaylist reports every stratum, with and without same-release matches", () => {
  // a's nearest is c (its mate), b's nearest is a (same release, not a mate).
  const v = (x, y) => Float32Array.from([x, y]);
  const candidates = [v(1, 0), v(0.9, 0.1), v(0.99, 0.01), v(0, 1)];
  const result = scorePlaylist(snapshot, candidates, [true, false, true, false]);
  assert.equal(result.sample_size, 4);
  assert.equal(result.with_lyrics.seeds, 2);
  assert.equal(result.without_lyrics.seeds, 2);
  const a = result.per_seed.find((s) => s.key === "6:a");
  assert.equal(a.rr, 1);
  assert.equal(result.all.seeds, 4);
  assert.ok(result.with_lyrics_excluding_same_release.seeds >= 1);
  const empty = scorePlaylist({ ...snapshot, playlists: [] }, candidates, [true, true, true, true]);
  assert.deepEqual(empty.all, { seeds: 0, recall10: null, mrr: null });
});

test("paired bootstrap is reproducible and counts wins, losses and ties", () => {
  assert.equal(rng(1)(), rng(1)());
  const r = paired([0.9, 0.8, 0.5], [0.8, 0.8, 0.6], 200);
  assert.deepEqual([r.wins, r.losses, r.ties], [1, 1, 1]);
  assert.ok(Math.abs(r.mean_delta) < 1e-12);
  assert.ok(r.ci95[0] <= r.ci95[1]);
  assert.deepEqual(paired([1], [0], 10).ci95, [1, 1]);
  assert.throws(() => paired([1], []), /must match/);
  assert.equal(baselineOf("IGL"), "I0");
  assert.equal(baselineOf("CL"), "C0");
});

test("scoreJudgments bounds unjudged hits and splits by hit lyrics", () => {
  const queriesBytes = Buffer.from(
    JSON.stringify({ queries: [{ id: "q1", group: "scene", text: "x" }] }),
  );
  const { createHash } = globalThis.process.getBuiltinModule("node:crypto");
  const sha = createHash("sha256").update(queriesBytes).digest("hex");
  const keys = Array.from({ length: 10 }, (_, i) => `6:k${i}`);
  const scores = {
    query_sha256: sha,
    lyric_keys: ["6:k0", "6:k1"],
    queries: { I0: { q1: keys }, IL: { q1: [...keys.slice(1), "6:k10"] } },
  };
  const review = {
    schema_version: 1,
    query_sha256: sha,
    queries: [
      {
        id: "q1",
        text: "x",
        candidates: keys.map((k, i) => ({
          friend_id: 6,
          track_id: k.slice(2),
          judgment: i < 7 ? "relevant" : "not_relevant",
          reason: "",
        })),
      },
    ],
  };
  const report = scoreJudgments([review], scores, queriesBytes);
  assert.equal(report.complete, false, "k10 is unjudged");
  assert.equal(report.runs.I0.lower_precision10, 0.7);
  assert.equal(report.runs.IL.unjudged, 1);
  assert.equal(report.runs.IL.upper_precision10, 0.7);
  assert.equal(report.runs.IL.lower_precision10, 0.6);
  assert.deepEqual(report.runs.I0.by_hit_lyrics.with_lyrics, {
    hits: 2,
    relevant: 2,
    not_relevant: 0,
    judged_precision: 1,
  });
  // IL drops relevant k0 and adds unjudged k10: at best a tie, at worst one hit lost.
  assert.deepEqual(report.comparisons["IL vs I0"], { delta_range: [-0.1, 0], bootstrap: null });
  review.queries[0].candidates.push({
    friend_id: 6,
    track_id: "k10",
    judgment: "not_relevant",
    reason: "",
  });
  const done = scoreJudgments([review], scores, queriesBytes);
  assert.equal(done.complete, true);
  assert.deepEqual(done.comparisons["IL vs I0"].delta_range, [-0.1, -0.1]);
  assert.equal(done.comparisons["IL vs I0"].bootstrap.losses, 1);
  review.queries[0].candidates.pop();
  assert.throws(
    () => scoreJudgments([review], { ...scores, query_sha256: "x" }, queriesBytes),
    /hash mismatch/,
  );
  const short = { ...scores, queries: { I0: { q1: keys.slice(1) } } };
  assert.throws(() => scoreJudgments([review], short, queriesBytes), /Invalid top 10/);
});

const summaryOf = (vocal, lang) => ({
  themes: ["x"],
  mood: ["calm"],
  languages: [lang],
  vocal_presence: vocal,
});

test("the quality sample is stratified and the tally needs notes", () => {
  const tracks = [];
  const summaries = new Map();
  for (let i = 0; i < 12; i++) {
    const id = `t${i}`;
    tracks.push({ track_id: id, friend_id: 6, title: id, artist: "A", lyrics: "synthetic" });
    summaries.set(
      id,
      summaryOf(i < 2 ? "hook-only" : "full lyrics", i % 3 ? "english" : "spanish"),
    );
  }
  tracks.push({ track_id: "failed", friend_id: 6, lyrics: "synthetic" });
  const snapshot = { schema_version: 1, lyrics_included: true, tracks };
  assert.equal(stratum(summaryOf("sparse", "english")), "sparse/english");
  assert.equal(
    stratum({ ...summaryOf("sparse", "english"), languages: ["english", "spanish"] }),
    "sparse/other",
  );
  const picked = sample(snapshot, summaries, 4);
  assert.equal(picked.length, 4);
  assert.ok(
    picked.some((p) => p.stratum.startsWith("hook-only")),
    "minority stratum included",
  );
  assert.equal(sample(snapshot, summaries, 100).length, 12, "failed summaries are not sampled");
  const s = sheet(snapshot, summaries, { model: "m", digest: "d", prompt_version: 1 }, 3);
  assert.equal(s.items.length, 3);
  assert.equal(tally(s).unreviewed, 3);
  s.items[0].verdict = "hallucinated";
  assert.throws(() => tally(s), /needs a note/);
  s.items[0].note = "invented a theme";
  s.items[1].verdict = "faithful";
  const counts = tally(s);
  assert.equal(counts.hallucinated, 1);
  assert.equal(counts.faithful, 1);
  s.items[2].verdict = "great";
  assert.throws(() => tally(s), /Invalid verdict/);
  assert.throws(() => tally({}), /Not a #1170/);
});

test("reviewer commands, display and atomic save", () => {
  const items = [
    {
      track_id: "a",
      stratum: "s",
      title: "T",
      artist: "A",
      lyrics: "synthetic",
      summary: summaryOf("sparse", "english"),
      verdict: null,
      note: "",
    },
    {
      track_id: "b",
      stratum: "s",
      title: "T",
      artist: "A",
      lyrics: "synthetic",
      summary: { ...summaryOf("sparse", "english"), themes: [] },
      verdict: null,
      note: "",
    },
  ];
  assert.match(display(items[0], 0, 2), /1\/2 \(s\)[\s\S]*themes: {3}x/);
  assert.match(display(items[1], 1, 2), /themes: {3}\(none\)/);
  assert.equal(apply(items, 0, "m", ""), 0, "a minor verdict needs a note");
  assert.equal(items[0].verdict, null);
  assert.equal(apply(items, 0, "m", " mood off "), 1);
  assert.deepEqual([items[0].verdict, items[0].note], ["minor", "mood off"]);
  assert.equal(apply(items, 1, "f"), 1);
  assert.equal(items[1].verdict, "faithful");
  assert.equal(apply(items, 1, "b"), 0);
  assert.equal(apply(items, 0, "s"), 1);
  assert.equal(apply(items, 1, ""), 1);
  assert.equal(apply(items, 1, "zzz"), 1);
  assert.equal(apply(items, 1, "q"), null);
  const dir = mkdtempSync(join(tmpdir(), "1170-review-"));
  try {
    const file = join(dir, "sheet.json");
    writeFileSync(file, "{}");
    save(file, { kind: "1170-summary-quality", items });
    assert.equal(JSON.parse(readFileSync(file, "utf8")).items[0].note, "mood off");
    assert.throws(() => save(file, { items }), /Not a #1170/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
