import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  bandOf,
  canonical,
  catalogueSql,
  loadSeeds,
  missingOf,
  primaryGenre,
  RULE,
  selectSeeds,
  serialize,
  SEEDS_SHA256,
  verifySeeds,
} from "./seeds.mjs";

const GENRES = ["Rock", "Latin", "Jazz"];
function catalogue() {
  const tracks = [];
  let n = 0;
  for (const bpm of [80, 100, 112, 128, 150])
    for (const genre of GENRES)
      for (let i = 0; i < 4; i++)
        tracks.push({
          track_id: `t${n++}`,
          friend_id: 6,
          bpm: bpm + i,
          key: "8A",
          has_identity: true,
          has_vibe: true,
          roots: [genre],
        });
  tracks.push({
    track_id: "x1",
    friend_id: 6,
    bpm: null,
    key: null,
    has_identity: true,
    has_vibe: false,
    roots: [],
  });
  tracks.push({
    track_id: "x2",
    friend_id: 6,
    bpm: 120,
    key: null,
    has_identity: true,
    has_vibe: true,
    roots: ["Rock"],
  });
  tracks.push({
    track_id: "other",
    friend_id: 4,
    bpm: 120,
    key: "1A",
    has_identity: true,
    has_vibe: true,
    roots: [],
  });
  tracks.push({
    track_id: "none",
    friend_id: 6,
    bpm: 120,
    key: "1A",
    has_identity: false,
    has_vibe: false,
    roots: [],
  });
  const playlists = [
    { playlist_id: 3, friend_id: 6, usable: 12 },
    { playlist_id: 1, friend_id: 6, usable: 9 },
    { playlist_id: 2, friend_id: 6, usable: 30 },
    { playlist_id: 9, friend_id: 6, usable: 101 },
    { playlist_id: 4, friend_id: 4, usable: 40 },
  ];
  return { tracks, playlists };
}
const rule = { ...RULE, per_band: 3, top_genres: 2, missing: 2, playlists: 5 };

test("bands and primary genres", () => {
  assert.equal(bandOf(89.9), "0-90");
  assert.equal(bandOf(90), "90-105");
  assert.equal(bandOf(200), "135+");
  assert.equal(bandOf(0), null);
  assert.equal(bandOf(null), null);
  assert.equal(bandOf(NaN), null);
  assert.equal(bandOf(50, [[60, 70]]), null);
  assert.equal(primaryGenre(["Rock", "Jazz", "Jazz"]), "Jazz");
  assert.equal(primaryGenre(["Rock", "Jazz"]), "Jazz", "ties go by name");
  assert.equal(primaryGenre([]), null);
  assert.equal(primaryGenre(undefined), null);
  assert.deepEqual(missingOf({ bpm: null, key: "", has_identity: false, has_vibe: false }), [
    "bpm",
    "key",
    "identity",
    "vibe",
  ]);
});

test("selection is deterministic and ignores catalogue order", () => {
  const a = selectSeeds(catalogue(), rule);
  const shuffledCatalogue = catalogue();
  shuffledCatalogue.tracks.reverse();
  shuffledCatalogue.playlists.reverse();
  const b = selectSeeds(shuffledCatalogue, rule);
  assert.equal(serialize(a), serialize(b));
  assert.equal(a.catalogue_sha256, b.catalogue_sha256);
  assert.equal(canonical(catalogue()), canonical(shuffledCatalogue));
});

test("seeds spread over every band and genre, plus missing-data seeds", () => {
  const seeds = selectSeeds(catalogue(), rule);
  const complete = seeds.tracks.filter((t) => !t.stratum.missing);
  assert.equal(complete.length, 5 * 3);
  for (const band of ["0-90", "90-105", "105-120", "120-135", "135+"])
    assert.equal(complete.filter((t) => t.stratum.band === band).length, 3);
  // Top 2 genres plus "other"; each band starts at a different genre.
  assert.deepEqual(
    new Set(complete.map((t) => t.stratum.genre)),
    new Set(["Jazz", "Latin", "other"]),
  );
  assert.notEqual(complete[0].stratum.genre, complete[3].stratum.genre);
  const missing = seeds.tracks.filter((t) => t.stratum.missing);
  assert.deepEqual(missing.map((t) => t.track_id).sort(), ["x1", "x2"]);
  assert.ok(seeds.tracks.every((t) => t.friend_id === 6 && t.track_id !== "none"));
  assert.equal(new Set(seeds.tracks.map((t) => t.track_id)).size, seeds.tracks.length);
  // Playlists: this library, 10 to 100 usable tracks.
  assert.deepEqual(
    seeds.playlists.map((p) => p.playlist_id),
    [2, 3],
  );
});

test("a band that runs out stops early instead of repeating", () => {
  const small = { tracks: catalogue().tracks.slice(0, 2), playlists: [] };
  const seeds = selectSeeds(small, { ...rule, per_band: 6, missing: 0 });
  assert.equal(seeds.tracks.length, 2);
});

test("the frozen file matches its hash, and any change is refused", () => {
  const raw = readFileSync(new URL("./seeds.json", import.meta.url), "utf8");
  const seeds = loadSeeds(new URL("./seeds.json", import.meta.url));
  assert.equal(seeds.kind, "1196-seeds");
  assert.ok(seeds.tracks.length >= 30 && seeds.tracks.length <= 40);
  assert.equal(seeds.playlists.length, 5);
  assert.throws(() => verifySeeds(raw.replace("6", "7")), /SHA-256 .* expected/);
  assert.throws(() => verifySeeds(raw, "0".repeat(64)), /frozen set changed/);
  const other = serialize({ kind: "other" });
  assert.throws(
    () => verifySeeds(other, createHash("sha256").update(other).digest("hex")),
    /Not a #1196/,
  );
  assert.match(SEEDS_SHA256, /^[0-9a-f]{64}$/);
});

test("the catalogue query only takes an integer library id", () => {
  assert.match(catalogueSql(6), /tg\.friend_id = 6/);
  assert.throws(() => catalogueSql("6; DROP TABLE tracks"), /integer/);
});
