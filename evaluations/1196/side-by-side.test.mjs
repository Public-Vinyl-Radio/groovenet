import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSideBySide, describe, sampleSeeds, tallySideBySide } from "./side-by-side.mjs";
import { apply, display, save } from "./review.mjs";

const pick = (id) => ({
  track_id: id,
  friend_id: 6,
  title: `T${id}`,
  artist: "Artist",
  album: `Al${id}`,
  year: "1975",
  styles: ["Cumbia", "Salsa", "Boogaloo", "Extra"],
  bpm: 121.4,
  key: "8A",
  score: 0.987654,
  key_relation: "same",
  genre_overlap: 0.42,
});
const seed = (key, beat, sel, kind = "track") => ({
  key,
  kind,
  ...(kind === "playlist" ? { name: "Friday", size: 12 } : {}),
  seed: {
    track_id: key,
    friend_id: 6,
    title: `Seed ${key.at(-1)}`,
    artist: "S",
    album: "SA",
    bpm: 120,
    key: "8A",
    styles: [],
  },
  lists: { beatmatcher: { picks: beat.map(pick) }, selector: { picks: sel.map(pick) } },
});
const results = {
  seeds_sha256: "abc",
  seeds: [
    seed("6:s1", ["a", "b"], ["b", "c"]),
    seed("6:s2", ["a", "b"], ["b", "a"]), // same tracks: an automatic tie
    seed("6:s3", ["d"], []),
    seed("playlist:9", ["e"], ["f"], "playlist"),
  ],
};

test("the sample depends on the seed keys only", () => {
  const keys = ["6:a", "6:b", "6:c", "6:d", "6:e"];
  assert.deepEqual(sampleSeeds(keys, 3), sampleSeeds([...keys].reverse(), 3));
  assert.equal(sampleSeeds(keys, 3).length, 3);
  assert.notDeepEqual(sampleSeeds(keys, 5, 1), sampleSeeds(keys, 5, 2));
  assert.equal(sampleSeeds(keys, 10).length, 5);
});

test("the sheet is blind: no profile, score or signal leaks into it", () => {
  const { sheet, key } = buildSideBySide(results, { sample: 10 });
  assert.equal(sheet.items.length, 3);
  assert.deepEqual(key.auto_ties, ["6:s2"]);
  const text = JSON.stringify(sheet);
  for (const leak of [
    "beatmatcher",
    "selector",
    "score",
    "0.98",
    "key_relation",
    "genre_overlap",
    "0.42",
    "6:s1",
    "playlist:9",
    "Extra",
  ])
    assert.ok(!text.includes(leak), `sheet leaks ${leak}`);
  assert.deepEqual(Object.keys(sheet.items[0]), ["id", "seed", "a", "b", "mix", "set", "note"]);
  const item = sheet.items.find((i) => key.items[i.id].seed === "6:s1");
  assert.equal([...item.a, ...item.b].filter((t) => t.in_both).length, 2);
  assert.equal(item.a[0].bpm, 121);
  const playlist = sheet.items.find((i) => key.items[i.id].seed === "playlist:9");
  assert.deepEqual([playlist.seed.playlist, playlist.seed.tracks], ["Friday", 12]);
  assert.deepEqual(
    sheet.items.map((i) => i.id),
    ["s001", "s002", "s003"],
  );
  // Both orders occur over enough seeds, and the key records which.
  const many = {
    seeds_sha256: "x",
    seeds: Array.from({ length: 30 }, (_, i) => seed(`6:m${i}`, ["a"], ["b"])),
  };
  const sides = Object.values(buildSideBySide(many, { sample: 30 }).key.items).map((k) => k.a);
  assert.ok(sides.includes("beatmatcher") && sides.includes("selector"));
  assert.deepEqual(describe({}), {
    title: "",
    artist: "",
    album: "",
    year: null,
    styles: [],
    bpm: null,
    key: null,
  });
});

test("scoring unblinds both questions and keeps ties and gaps apart", () => {
  const { sheet, key } = buildSideBySide(results, { sample: 10 });
  const [first, second] = sheet.items;
  // Pick the Beatmatcher list for mix and the Selector list for set on the first item.
  const bmSide = key.items[first.id].a === "beatmatcher" ? "a" : "b";
  first.mix = bmSide;
  first.set = bmSide === "a" ? "b" : "a";
  second.mix = "same";
  second.set = "same";
  const score = tallySideBySide(sheet, key);
  assert.deepEqual(
    { ...score.mix, sign_test_p: undefined },
    { beatmatcher: 1, selector: 0, same: 1, auto_tie: 1, unreviewed: 1, sign_test_p: undefined },
  );
  assert.equal(score.set.selector, 1);
  assert.equal(score.set.beatmatcher, 0);
  assert.equal(score.mix.sign_test_p, 1);
  assert.equal(score.reviewed, 2);
  assert.throws(() => tallySideBySide({ kind: "x" }, key), /Not a #1196/);
  assert.throws(
    () => tallySideBySide({ ...sheet, items: [{ ...first, id: "s999" }] }, key),
    /not in the key/,
  );
  assert.throws(
    () => tallySideBySide({ ...sheet, items: [{ ...first, mix: "maybe" }] }, key),
    /Invalid mix/,
  );
});

test("the reviewer takes two answers, a note, and navigation", () => {
  const { sheet } = buildSideBySide(results, { sample: 10 });
  const items = sheet.items;
  assert.deepEqual(apply(items, 0, "a = a keeps the groove"), { index: 1, saved: true });
  assert.deepEqual(
    [items[0].mix, items[0].set, items[0].note],
    ["a", "same", "a keeps the groove"],
  );
  assert.deepEqual(apply(items, 1, "a"), { index: 1, saved: false }, "both answers are needed");
  assert.deepEqual(apply(items, 1, "x b"), { index: 1, saved: false });
  assert.deepEqual(apply(items, 1, "s"), { index: 2, saved: false });
  assert.deepEqual(apply(items, 2, ""), { index: 2, saved: false }, "the last item stays put");
  assert.deepEqual(apply(items, 2, "p"), { index: 1, saved: false });
  assert.deepEqual(apply(items, 0, "p"), { index: 0, saved: false });
  assert.deepEqual(apply(items, 1, "q"), { index: null, saved: false });
  const text = display(items[0], 0, items.length);
  assert.match(text, /Which would you mix from this track\?/);
  assert.match(text, /Which makes the more interesting set\?/);
  assert.match(text, /Current: mix A · set no difference \| a keeps the groove/);
  const playlist = items.find((i) => i.seed.playlist !== undefined);
  assert.match(display(playlist, 0, 1), /Playlist "Friday" \(12 tracks\), ending on:/);
  const empty = items.find((i) => !i.a.length || !i.b.length);
  assert.match(display(empty, 0, 1), /\(no suggestions\)/);
  assert.match(
    display({ ...items[0], a: [{ ...items[0].a[0], bpm: null, key: null, styles: [] }] }, 0, 1),
    /no BPM · no key/,
  );
});

test("save replaces the sheet atomically and refuses anything else", () => {
  const dir = mkdtempSync(join(tmpdir(), "1196-"));
  try {
    const file = join(dir, "sheet.json");
    const { sheet } = buildSideBySide(results, { sample: 10 });
    save(file, sheet);
    save(file, sheet);
    assert.equal(JSON.parse(readFileSync(file, "utf8")).kind, "1196-side-by-side");
    assert.throws(() => save(file, { kind: "other" }), /Not a #1196/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
