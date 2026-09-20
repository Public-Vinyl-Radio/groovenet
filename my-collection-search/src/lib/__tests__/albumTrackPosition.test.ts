import { describe, expect, it } from "vitest";
import {
  compareTrackPositions,
  getTrackSideLabel,
  normalizeAlbumTrackSides,
  parseTrackPosition,
} from "../albumTrackPosition";

describe("parseTrackPosition", () => {
  it("extracts record sides from Discogs-style positions", () => {
    expect(parseTrackPosition("A1")).toMatchObject({
      raw: "A1",
      side: "A",
      sideLabel: "Side A",
      num: 1,
    });
    expect(parseTrackPosition("b12")).toMatchObject({
      raw: "b12",
      side: "B",
      sideLabel: "Side B",
      num: 12,
    });
  });

  it("preserves multi-letter sides", () => {
    expect(parseTrackPosition("AA1")).toMatchObject({
      side: "AA",
      sideLabel: "Side AA",
      num: 1,
      classification: "multi-letter-side",
    });
  });

  it("maps numeric disc-track formats to deterministic disc groups", () => {
    expect(parseTrackPosition("1-1")).toMatchObject({
      side: "DISC-1",
      sideLabel: "Disc 1",
      num: 1,
      classification: "disc-track",
    });
    expect(parseTrackPosition("2.3")).toMatchObject({
      side: "DISC-2",
      sideLabel: "Disc 2",
      num: 3,
      classification: "disc-track",
    });
  });

  it("does not create a side label for plain numeric positions", () => {
    expect(getTrackSideLabel(3)).toBeNull();
    expect(getTrackSideLabel("12")).toBeNull();
  });

  it("sorts sides and track numbers naturally", () => {
    const positions = ["B2", "A10", "A2", "B1", "A1"];
    expect([...positions].sort(compareTrackPositions)).toEqual([
      "A1",
      "A2",
      "A10",
      "B1",
      "B2",
    ]);
  });

  it("sorts numeric multi-disc positions deterministically", () => {
    const positions = ["2-2", "1-10", "1-2", "2-1", "1-1"];
    expect([...positions].sort(compareTrackPositions)).toEqual([
      "1-1",
      "1-2",
      "1-10",
      "2-1",
      "2-2",
    ]);
  });
});

describe("normalizeAlbumTrackSides", () => {
  it("groups single-letter vinyl sides", () => {
    const groups = normalizeAlbumTrackSides([
      { track_id: "b1", position: "B1" },
      { track_id: "a2", position: "A2" },
      { track_id: "a1", position: "A1" },
    ]);

    expect(groups.map((group) => ({
      side_key: group.side_key,
      side_label: group.side_label,
      tracks: group.tracks.map((track) => track.track_id),
    }))).toEqual([
      { side_key: "A", side_label: "Side A", tracks: ["a1", "a2"] },
      { side_key: "B", side_label: "Side B", tracks: ["b1"] },
    ]);
  });

  it("groups AA/BB style positions as distinct sides", () => {
    const groups = normalizeAlbumTrackSides([
      { track_id: "bb1", position: "BB1" },
      { track_id: "aa2", position: "AA2" },
      { track_id: "aa1", position: "AA1" },
    ]);

    expect(groups.map((group) => group.side_key)).toEqual(["AA", "BB"]);
    expect(groups[0].tracks.map((track) => track.track_id)).toEqual(["aa1", "aa2"]);
  });

  it("falls back to disc groups for 1-1 style multi-disc positions", () => {
    const groups = normalizeAlbumTrackSides([
      { track_id: "disc2a", position: "2-1" },
      { track_id: "disc1b", position: "1-2" },
      { track_id: "disc1a", position: "1-1" },
    ]);

    expect(groups.map((group) => ({
      side_key: group.side_key,
      side_label: group.side_label,
      tracks: group.tracks.map((track) => track.track_id),
    }))).toEqual([
      { side_key: "DISC-1", side_label: "Disc 1", tracks: ["disc1a", "disc1b"] },
      { side_key: "DISC-2", side_label: "Disc 2", tracks: ["disc2a"] },
    ]);
  });

  it("uses Tracklist as deterministic fallback for plain numeric positions", () => {
    const groups = normalizeAlbumTrackSides([
      { track_id: "t2", position: "2" },
      { track_id: "t1", position: "1" },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].side_key).toBe("TRACKLIST");
    expect(groups[0].side_label).toBe("Tracklist");
    expect(groups[0].tracks.map((track) => track.track_id)).toEqual(["t1", "t2"]);
  });
});

describe("parseTrackPosition edge cases", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty string", ""],
    ["whitespace only", "   "],
  ])("classifies %s as empty and sorts it last", (_label, input) => {
    expect(parseTrackPosition(input)).toEqual({
      raw: "",
      normalized: "",
      side: "",
      sideLabel: null,
      num: 0,
      rest: "",
      sortGroup: "ZZZ",
      sortMajor: Number.MAX_SAFE_INTEGER,
      sortMinor: Number.MAX_SAFE_INTEGER,
      classification: "empty",
    });
  });

  it("accepts a number as the position", () => {
    expect(parseTrackPosition(7)).toMatchObject({
      raw: "7",
      num: 7,
      classification: "numeric",
      sortGroup: "NUMERIC",
    });
  });

  it("keeps a trailing letter as `rest` without disturbing the side", () => {
    expect(parseTrackPosition("A1B")).toMatchObject({
      side: "A",
      num: 1,
      rest: "B",
      sortGroup: "SIDE:A",
      classification: "side-number",
    });
  });

  it("tolerates whitespace between the side and the track number", () => {
    expect(parseTrackPosition("A 1")).toMatchObject({
      side: "A",
      num: 1,
      classification: "side-number",
    });
  });

  it("keeps `rest` on multi-letter and disc positions", () => {
    expect(parseTrackPosition("AA1B")).toMatchObject({
      side: "AA",
      num: 1,
      rest: "B",
      classification: "multi-letter-side",
    });
    expect(parseTrackPosition("1-2C")).toMatchObject({
      side: "DISC-1",
      num: 2,
      rest: "C",
      classification: "disc-track",
    });
  });

  it("accepts spaces around the disc separator", () => {
    expect(parseTrackPosition("2 . 5")).toMatchObject({
      side: "DISC-2",
      num: 5,
      classification: "disc-track",
    });
  });

  it("treats an unparseable leading word as a fallback side", () => {
    expect(parseTrackPosition("BONUS")).toMatchObject({
      side: "BONUS",
      sideLabel: "Side BONUS",
      num: 0,
      sortGroup: "FALLBACK:BONUS",
      sortMajor: 4,
      classification: "freeform",
    });
  });

  it("keeps the leftover text as `rest` when a position only partly parses", () => {
    expect(parseTrackPosition("A1-B")).toMatchObject({
      side: "A",
      num: 1,
      rest: "-B",
      sortGroup: "FALLBACK:A",
      sortMajor: 4,
      classification: "freeform",
    });
  });

  it.each(["-", "???"])("treats %s as a sideless freeform position", (input) => {
    expect(parseTrackPosition(input)).toMatchObject({
      side: "",
      sideLabel: null,
      sortGroup: `FREEFORM:${input}`,
      sortMajor: 5,
      classification: "freeform",
    });
  });
});

describe("compareTrackPositions tiebreakers", () => {
  it("returns 0 for identical positions", () => {
    expect(compareTrackPositions("A1", "A1")).toBe(0);
  });

  it("orders classifications: sides, multi-letter, discs, numeric, fallback, freeform, empty", () => {
    const positions = ["", "???", "A1-B", "5", "1-1", "AA1", "A1"];
    expect([...positions].sort(compareTrackPositions)).toEqual([
      "A1",
      "AA1",
      "1-1",
      "5",
      "A1-B",
      "???",
      "",
    ]);
  });

  it("falls back to `rest` when side and number match", () => {
    expect(compareTrackPositions("A1B", "A1A")).toBeGreaterThan(0);
    expect(compareTrackPositions("A1A", "A1B")).toBeLessThan(0);
    expect([...["A1C", "A1A", "A1B"]].sort(compareTrackPositions)).toEqual([
      "A1A",
      "A1B",
      "A1C",
    ]);
  });

  it("falls back to the normalized text when every other key matches", () => {
    // "A 1" and "A1" agree on side, number and rest; only the raw text differs.
    expect(compareTrackPositions("A 1", "A1")).toBeLessThan(0);
    expect(compareTrackPositions("A1", "A 1")).toBeGreaterThan(0);
  });

  it("separates distinct sides that share a sort major and number", () => {
    expect(compareTrackPositions("A1", "B1")).toBeLessThan(0);
  });

  it("sorts empty positions to the end regardless of order", () => {
    expect([...["", "A1", ""]].sort(compareTrackPositions)).toEqual(["A1", "", ""]);
  });
});

describe("getTrackSideLabel", () => {
  it.each([
    ["A1", "Side A"],
    ["AA1", "Side AA"],
    ["1-2", "Disc 1"],
    ["BONUS", "Side BONUS"],
  ])("labels %s as %s", (position, expected) => {
    expect(getTrackSideLabel(position)).toBe(expected);
  });

  it.each([null, undefined, "", "5", "???"])(
    "returns null for %s",
    (position) => {
      expect(getTrackSideLabel(position)).toBeNull();
    }
  );
});

describe("normalizeAlbumTrackSides grouping fallbacks", () => {
  it("returns no groups for an empty track list", () => {
    expect(normalizeAlbumTrackSides([])).toEqual([]);
  });

  it("collects positionless tracks into Tracklist", () => {
    const groups = normalizeAlbumTrackSides([
      { track_id: "b", position: null },
      { track_id: "a", position: undefined },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ side_key: "TRACKLIST", side_label: "Tracklist" });
  });

  it("puts numeric and positionless tracks in the same Tracklist group", () => {
    const groups = normalizeAlbumTrackSides([
      { track_id: "empty", position: "" },
      { track_id: "one", position: "1" },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].side_key).toBe("TRACKLIST");
    // Numeric sorts ahead of empty, so the numeric track leads.
    expect(groups[0].tracks.map((track) => track.track_id)).toEqual(["one", "empty"]);
  });

  it("gives a sideless freeform position its own group keyed by its text", () => {
    const groups = normalizeAlbumTrackSides([{ track_id: "x", position: "???" }]);

    expect(groups[0]).toMatchObject({ side_key: "???", side_label: "???" });
  });

  it("assigns ordinals and track counts in encounter order", () => {
    const groups = normalizeAlbumTrackSides([
      { track_id: "b1", position: "B1" },
      { track_id: "a1", position: "A1" },
      { track_id: "a2", position: "A2" },
    ]);

    expect(groups.map((group) => ({
      key: group.side_key,
      ordinal: group.ordinal,
      track_count: group.track_count,
    }))).toEqual([
      { key: "A", ordinal: 0, track_count: 2 },
      { key: "B", ordinal: 1, track_count: 1 },
    ]);
  });

  it("does not mutate the caller's array", () => {
    const tracks = [
      { track_id: "b1", position: "B1" },
      { track_id: "a1", position: "A1" },
    ];
    normalizeAlbumTrackSides(tracks);

    expect(tracks.map((track) => track.track_id)).toEqual(["b1", "a1"]);
  });

  it("labels a group the same way getTrackSideLabel does", () => {
    for (const position of ["A1", "AA1", "1-2", "BONUS"]) {
      const [group] = normalizeAlbumTrackSides([{ track_id: "x", position }]);
      expect(group.side_label).toBe(getTrackSideLabel(position));
    }
  });

  it("labels a side consistently whether or not it holds a freeform position", () => {
    const freeformOnly = normalizeAlbumTrackSides([
      { track_id: "weird", position: "A1-B" },
    ]);
    const mixed = normalizeAlbumTrackSides([
      { track_id: "weird", position: "A1-B" },
      { track_id: "plain", position: "A1" },
    ]);

    // Both describe side A, so both read "Side A" — the heading must not
    // depend on which of the side's tracks happens to be grouped first.
    expect(freeformOnly[0].side_label).toBe("Side A");
    expect(mixed[0].side_label).toBe("Side A");
  });

  it("keeps disc and vinyl sides in separate groups", () => {
    const groups = normalizeAlbumTrackSides([
      { track_id: "d", position: "1-1" },
      { track_id: "a", position: "A1" },
    ]);

    expect(groups.map((group) => group.side_key)).toEqual(["A", "DISC-1"]);
  });
});
