import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSideBySide, pickSeeds, signTest, tallySideBySide, topK } from "./side-by-side.mjs";
import { apply, display, save } from "./review-side-by-side.mjs";

const track = (id, release) => ({
  track_id: id,
  friend_id: 6,
  release_id: release,
  title: `T${id}`,
  artist: "A",
  album: "Al",
  year: "1975",
  local_tags: "",
  notes: "secret AI note",
  lyrics: "secret lyrics",
});
const ids = ["a", "b", "c", "d", "e"];
const snapshot = {
  tracks: ids.map((id, i) => track(id, `r${i}`)),
  albums: [{ friend_id: 6, release_id: "r0", styles: ["Cumbia"] }],
  playlists: [{ tracks: ids.slice(0, 4).map((track_id) => ({ track_id, friend_id: 6 })) }],
};

test("seeds come from playlists, split by summary", () => {
  const hasSummary = [true, true, false, false, true];
  const seeds = pickSeeds(snapshot, hasSummary, 1, 1);
  assert.deepEqual(
    seeds.map((s) => hasSummary[s.index]),
    [true, false],
  );
  assert.ok(
    seeds.every((s) => s.index !== 4),
    "e is on no playlist",
  );
});

test("topK excludes the seed and keeps cosine order", () => {
  const v = (x, y) => Float32Array.from([x, y]);
  const candidates = [v(1, 0), v(0, 1), v(0.9, 0.1), v(0.5, 0.5)];
  assert.deepEqual(topK(candidates, 0, 2), [2, 3]);
});

test("the sheet is blind, ties are automatic, and the tally unblinds", () => {
  const seeds = [0, 1, 2].map((index) => ({ index, key: `6:${ids[index]}` }));
  const lists = {
    I0: (i) => [(i + 1) % 5, (i + 2) % 5],
    // Same tracks as I0 for seed 0 (in another order); different otherwise.
    IL: (i) => (i === 0 ? [2, 1] : [(i + 1) % 5, (i + 3) % 5]),
  };
  const { sheet, key } = buildSideBySide(snapshot, seeds, [["IL", "I0"]], lists, 7);
  assert.equal(key.auto_ties.length, 1);
  assert.equal(sheet.items.length, 2);
  const text = JSON.stringify(sheet);
  for (const leak of ["IL", "I0", "secret", "comparison", "score"])
    assert.ok(!text.includes(leak), `sheet leaks ${leak}`);
  assert.equal(sheet.items[0].a.filter((t) => t.in_both).length, 1);
  const first = sheet.items.find((x) => key.items[x.id].seed === "6:b") ?? sheet.items[0];
  assert.ok(Array.isArray(first.seed.styles));

  assert.deepEqual(tallySideBySide(sheet, key)["IL vs I0"], {
    variant: 0,
    baseline: 0,
    same: 0,
    auto_tie: 1,
    unreviewed: 2,
    sign_test_p: 1,
  });
  // Pick the variant's list on the first item, call the second the same.
  const k0 = key.items[sheet.items[0].id];
  sheet.items[0].verdict = k0.a === "IL" ? "a" : "b";
  sheet.items[1].verdict = "same";
  const t = tallySideBySide(sheet, key)["IL vs I0"];
  assert.deepEqual([t.variant, t.baseline, t.same], [1, 0, 1]);
  sheet.items[0].verdict = k0.a === "IL" ? "b" : "a";
  assert.equal(tallySideBySide(sheet, key)["IL vs I0"].baseline, 1);

  sheet.items[1].verdict = "maybe";
  assert.throws(() => tallySideBySide(sheet, key), /Invalid verdict/);
  assert.throws(() => tallySideBySide(sheet, { ...key, items: {} }), /not in the key/);
  assert.throws(() => tallySideBySide({}, key), /Not a #1170/);
  // The random order is reproducible.
  assert.deepEqual(
    buildSideBySide(snapshot, seeds, [["IL", "I0"]], lists, 7).key,
    buildSideBySide(snapshot, seeds, [["IL", "I0"]], lists, 7).key,
  );
});

test("sign test", () => {
  assert.equal(signTest(0, 0), 1);
  assert.equal(signTest(3, 3), 1);
  assert.ok(Math.abs(signTest(10, 0) - 2 / 1024) < 1e-12);
  assert.ok(Math.abs(signTest(1, 9) - 22 / 1024) < 1e-12);
});

test("reviewer commands, display and atomic save", () => {
  const row = (title, in_both) => ({
    title,
    artist: "A",
    album: "Al",
    year: "",
    styles: [],
    in_both,
  });
  const items = [
    {
      id: "s001",
      seed: { ...row("Seed"), styles: ["Cumbia"], tags: "chicha" },
      a: [row("X", true), row("Y", false)],
      b: [row("X", true)],
      verdict: null,
      note: "",
    },
    { id: "s002", seed: row("S2"), a: [], b: [], verdict: null, note: "" },
  ];
  const shown = display(items[0], 0, 2);
  assert.match(shown, /1\/2/);
  assert.match(shown, /tags: chicha/);
  assert.match(shown, /= {2}1\. X — A \(Al\)/);
  assert.match(shown, / {3}2\. Y/);
  assert.equal(apply(items, 0, "b  more latin "), 1);
  assert.deepEqual([items[0].verdict, items[0].note], ["b", "more latin"]);
  assert.match(display(items[0], 0, 2), /Current: B \| more latin/);
  assert.equal(apply(items, 1, "="), 1);
  assert.equal(items[1].verdict, "same");
  assert.equal(apply(items, 1, "A"), 1);
  assert.equal(items[1].verdict, "a");
  assert.equal(apply(items, 1, "p"), 0);
  assert.equal(apply(items, 0, "s"), 1);
  assert.equal(apply(items, 1, ""), 1);
  assert.equal(apply(items, 1, "zzz"), 1);
  assert.equal(apply(items, 1, "q"), null);
  const dir = mkdtempSync(join(tmpdir(), "1170-sbs-"));
  try {
    const file = join(dir, "sheet.json");
    writeFileSync(file, "{}");
    save(file, { kind: "1170-side-by-side", items });
    assert.equal(JSON.parse(readFileSync(file, "utf8")).items[0].note, "more latin");
    assert.throws(() => save(file, { items }), /Not a #1170/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
