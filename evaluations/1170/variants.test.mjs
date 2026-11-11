import { test } from "node:test";
import assert from "node:assert/strict";
import { identityText as identity379 } from "../379/prepare.mjs";
import { contextText, fileGenres, identityData, identityText, variants } from "./variants.mjs";
import { describe, prepare } from "./prepare.mjs";

const LYRICS = "synthetic verse line one\nsynthetic hook\nsynthetic hook";
const track = {
  track_id: "t1",
  friend_id: 6,
  release_id: "r1",
  title: "Song",
  artist: "Artist",
  album: "Album",
  year: 1974,
  composer: "Writer B, Writer A",
  audio_file_genre: ["Latin", "Música Tropical"],
  local_tags: "Cumbia Amazónica, warm-up",
  lyrics: LYRICS,
};
const album = {
  friend_id: 6,
  release_id: "r1",
  country: "Peru",
  label: "Infopesa, Discos Fuentes",
  genres: ["Latin"],
  styles: ["Cumbia", "Chicha"],
};
const summary = {
  themes: ["late-night longing", "party"],
  mood: ["yearning"],
  languages: ["spanish"],
  vocal_presence: "full lyrics",
};

test("the identity baseline is #379's builder, which mirrors the app", () => {
  for (const t of [track, { ...track, composer: null, audio_file_genre: null }]) {
    assert.equal(identityText(identityData(t, album)), identity379(t, album));
  }
  assert.equal(identityText(identityData({ track_id: "x" })), identity379({ track_id: "x" }));
});

test("the context baseline mirrors buildContextText", () => {
  assert.equal(
    contextText(identityData(track, album)),
    [
      "chicha, cumbia, cumbia amazonica. latin music from the 1970s.",
      "Track: Song — Artist",
      "Release: Album",
      "Labels: discos fuentes, infopesa",
    ].join("\n"),
  );
  assert.equal(
    contextText(identityData({ track_id: "x" })).split("\n")[0],
    "music.",
    "no descriptors, genres or era",
  );
});

test("file genres drop values the release already has", () => {
  const d = identityData(track, album);
  assert.deepEqual(fileGenres(track, d), ["musica tropical"]);
  assert.deepEqual(fileGenres({ ...track, audio_file_genre: ["Cumbia"] }, d), []);
  assert.deepEqual(fileGenres({ ...track, audio_file_genre: null }, d), []);
});

test("variants add file genre and lyric lines without touching the baseline lines", () => {
  const v = variants(track, album, summary);
  assert.equal(v.IG, `${v.I0}\nFile genre: musica tropical`);
  assert.equal(
    v.IL,
    `${v.I0}\nLyrics: late-night longing, party; mood yearning; language spanish; vocals full lyrics`,
  );
  assert.equal(v.IGL, `${v.IG}\n${v.IL.split("\n").at(-1)}`);
  assert.match(v.CG.split("\n")[0], /latin, musica tropical music from the 1970s\.$/);
  assert.equal(
    v.CL.split("\n")[0],
    "chicha, cumbia, cumbia amazonica. latin music from the 1970s. Lyrics about late-night longing, party; yearning mood; sung in spanish; full lyrics.",
  );
  assert.deepEqual(v.CGL.split("\n").slice(1), v.C0.split("\n").slice(1));
  for (const text of Object.values(v)) assert.ok(!text.includes("synthetic"), "no raw lyrics");
});

test("a track without a summary keeps its baseline text in L variants", () => {
  const v = variants(track, album, null);
  assert.equal(v.IL, v.I0);
  assert.equal(v.CL, v.C0);
  assert.equal(v.IGL, v.IG);
});

test("prepare flags lyrics and summaries and describe counts only", () => {
  const snapshot = {
    friend_id: 6,
    tracks: [track, { ...track, track_id: "t2", lyrics: null, audio_file_genre: ["Latin"] }],
    albums: [album],
  };
  const rows = prepare(snapshot, new Map([["t1", summary]]));
  assert.deepEqual(
    rows.map((r) => [r.has_lyrics, r.has_summary, r.adds_file_genre]),
    [
      [true, true, true],
      [false, false, false],
    ],
  );
  const report = describe(rows);
  assert.equal(report.with_lyrics, 1);
  assert.equal(report.failed_summary, 0);
  assert.equal(report.by_variant.IL.differs_from_baseline, 1);
  assert.equal(report.by_variant.CG.differs_from_baseline, 1);
  assert.equal(report.by_variant.I0.differs_from_baseline, 0);
  assert.ok(!JSON.stringify(report).includes("synthetic"));
  assert.throws(() => prepare({ ...snapshot, friend_id: 7 }, new Map()), /another friend/);
  assert.throws(() => prepare({}, new Map()), /Invalid/);
});
