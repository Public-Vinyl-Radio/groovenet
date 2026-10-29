import { describe, expect, it } from "vitest";
import {
  camelotCompatible,
  checkPlaylist,
  DEFAULT_BPM_JUMP_THRESHOLD,
  formatDurationHms,
  parseTrackId,
  toCamelot,
  type CheckableTrack,
} from "./playlistCheck.js";

function t(track_id: string, extra: Partial<CheckableTrack> = {}): CheckableTrack {
  return { track_id, bpm: 120, key: "A minor", duration_seconds: 200, ...extra };
}

describe("toCamelot", () => {
  it.each([
    ["A minor", "8A"],
    ["C major", "8B"],
    ["Ab minor", "1A"],
    ["G# minor", "1A"],
    ["B major", "1B"],
    ["Db major", "3B"],
    ["C# major", "3B"],
    ["Bb major", "6B"],
    ["A# major", "6B"],
    ["Eb minor", "2A"],
    ["D# minor", "2A"],
    ["Gb major", "2B"],
    ["F# major", "2B"],
    ["F# minor", "11A"],
    ["C# minor", "12A"],
    ["Db minor", "12A"],
    ["E major", "12B"],
    ["Cb major", "1B"],
    ["Fb major", "12B"],
    ["E# minor", "4A"],
    ["B# major", "8B"],
    ["Am", "8A"],
    ["F#m", "11A"],
    ["Amin", "8A"],
    ["a MINOR", "8A"],
    ["Bbmaj", "6B"],
    ["F♯ minor", "11A"],
    ["B♭ major", "6B"],
    ["  C   major ", "8B"],
    ["8A", "8A"],
    ["12b", "12B"],
    [" 1a ", "1A"],
  ])("%s -> %s", (key, expected) => {
    expect(toCamelot(key)).toBe(expected);
  });

  it.each([null, undefined, "", "  ", "H minor", "A", "13A", "0B", "A dorian", "Cbb major"])(
    "rejects %j",
    (key) => {
      expect(toCamelot(key)).toBeNull();
    },
  );
});

describe("camelotCompatible", () => {
  it("accepts same key, neighbours, wraparound and the relative swap", () => {
    expect(camelotCompatible("8A", "8A")).toBe(true);
    expect(camelotCompatible("8A", "9A")).toBe(true);
    expect(camelotCompatible("8A", "7A")).toBe(true);
    expect(camelotCompatible("12B", "1B")).toBe(true);
    expect(camelotCompatible("1A", "12A")).toBe(true);
    expect(camelotCompatible("8A", "8B")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(camelotCompatible("8A", "10A")).toBe(false);
    expect(camelotCompatible("8A", "9B")).toBe(false);
    expect(camelotCompatible("1A", "11A")).toBe(false);
    expect(camelotCompatible("nonsense", "8A")).toBe(false);
    expect(camelotCompatible("8A", "nonsense")).toBe(false);
  });
});

describe("parseTrackId", () => {
  it.each([
    ["33416876-D2", { release: "33416876", side: "D", index: 2 }],
    ["33416876-b", { release: "33416876", side: "B", index: 0 }],
    ["1-C7", { release: "1", side: "C", index: 7 }],
    ["1-A10", { release: "1", side: "A", index: 10 }],
    ["1-12", { release: "1", side: null, index: 0 }],
    ["1-A2-x", { release: "1", side: null, index: 0 }],
    ["1-", { release: "1", side: null, index: 0 }],
    ["plain", { release: "plain", side: null, index: 0 }],
  ])("%s", (id, expected) => {
    expect(parseTrackId(id)).toEqual(expected);
  });
});

describe("formatDurationHms", () => {
  it("formats under and over an hour", () => {
    expect(formatDurationHms(0)).toBe("0:00");
    expect(formatDurationHms(65)).toBe("1:05");
    expect(formatDurationHms(3600)).toBe("1:00:00");
    expect(formatDurationHms(3725.4)).toBe("1:02:05");
  });
});

describe("checkPlaylist", () => {
  it("is clean for an empty playlist", () => {
    const r = checkPlaylist([]);
    expect(r).toMatchObject({ track_count: 0, total_duration_seconds: 0, ok: true });
    expect(r.bpm.threshold).toBe(DEFAULT_BPM_JUMP_THRESHOLD);
  });

  it("sums durations and lists tracks without one", () => {
    const r = checkPlaylist([
      t("1-A1"),
      t("2-A1", { duration_seconds: 100 }),
      t("3-A1", { duration_seconds: null }),
      t("4-A1", { duration_seconds: 0 }),
      t("5-A1", { duration_seconds: undefined }),
    ]);
    expect(r.total_duration_seconds).toBe(300);
    expect(r.missing_duration).toEqual([3, 4, 5]);
  });

  describe("BPM", () => {
    it("builds the curve, parsing numeric strings and flagging missing values", () => {
      const r = checkPlaylist([
        t("1-A1", { bpm: "120.5" }),
        t("2-A1", { bpm: null }),
        t("3-A1", { bpm: "fast" }),
        t("4-A1", { bpm: 0 }),
        t("5-A1", { bpm: undefined }),
        t("6-A1", { bpm: 128 }),
      ]);
      expect(r.bpm.curve.map((p) => p.bpm)).toEqual([120.5, null, null, null, null, 128]);
      expect(r.bpm.curve[0]).toEqual({ position: 1, track_id: "1-A1", bpm: 120.5 });
      expect(r.bpm.missing).toEqual([2, 3, 4, 5]);
      expect(r.bpm.jumps).toEqual([]);
    });

    it("flags only differences above the threshold, in either direction", () => {
      const r = checkPlaylist([
        t("1-A1", { bpm: 120 }),
        t("2-A1", { bpm: 128 }),
        t("3-A1", { bpm: 128.5 }),
        t("4-A1", { bpm: 140.25 }),
        t("5-A1", { bpm: 130 }),
      ]);
      expect(r.bpm.jumps).toEqual([
        {
          from_position: 3,
          to_position: 4,
          from_track_id: "3-A1",
          to_track_id: "4-A1",
          from_bpm: 128.5,
          to_bpm: 140.25,
          delta: 11.75,
        },
        {
          from_position: 4,
          to_position: 5,
          from_track_id: "4-A1",
          to_track_id: "5-A1",
          from_bpm: 140.25,
          to_bpm: 130,
          delta: -10.25,
        },
      ]);
      expect(r.ok).toBe(false);
    });

    it("honours a custom threshold and does not compare across a missing BPM", () => {
      const tracks = [
        t("1-A1", { bpm: 100 }),
        t("2-A1", { bpm: 105 }),
        t("3-A1", { bpm: null }),
        t("4-A1", { bpm: 140 }),
      ];
      expect(checkPlaylist(tracks).bpm.jumps).toEqual([]);
      const strict = checkPlaylist(tracks, { bpmJumpThreshold: 4 });
      expect(strict.bpm.threshold).toBe(4);
      expect(strict.bpm.jumps.map((j) => j.to_position)).toEqual([2]);
    });
  });

  describe("keys", () => {
    it("flags incompatible adjacent pairs with both spellings and Camelot codes", () => {
      const r = checkPlaylist([
        t("1-A1", { key: "A minor" }),
        t("2-A1", { key: "C major" }),
        t("3-A1", { key: "G# minor" }),
        t("4-A1", { key: "Ab major" }),
        t("5-A1", { key: "E minor" }),
      ]);
      // 8A -> 8B ok; 8B -> 1A clash; 1A -> 4B clash; 4B -> 9A clash
      expect(r.keys.clashes).toEqual([
        {
          from_position: 2,
          to_position: 3,
          from_track_id: "2-A1",
          to_track_id: "3-A1",
          from_key: "C major",
          to_key: "G# minor",
          from_camelot: "8B",
          to_camelot: "1A",
        },
        {
          from_position: 3,
          to_position: 4,
          from_track_id: "3-A1",
          to_track_id: "4-A1",
          from_key: "G# minor",
          to_key: "Ab major",
          from_camelot: "1A",
          to_camelot: "4B",
        },
        {
          from_position: 4,
          to_position: 5,
          from_track_id: "4-A1",
          to_track_id: "5-A1",
          from_key: "Ab major",
          to_key: "E minor",
          from_camelot: "4B",
          to_camelot: "9A",
        },
      ]);
    });

    it("treats enharmonic spellings as the same key", () => {
      expect(
        checkPlaylist([t("1-A1", { key: "Ab minor" }), t("2-A1", { key: "G# minor" })]).keys
          .clashes,
      ).toEqual([]);
    });

    it("skips pairs with a missing or unrecognised key and reports their positions", () => {
      const r = checkPlaylist([
        t("1-A1", { key: "A minor" }),
        t("2-A1", { key: null }),
        t("3-A1", { key: "F# major" }),
        t("4-A1", { key: "nonsense" }),
        t("5-A1", { key: undefined }),
      ]);
      expect(r.keys.clashes).toEqual([]);
      expect(r.keys.missing).toEqual([2, 4, 5]);
    });
  });

  describe("repeated releases", () => {
    it("groups by the release prefix and lists every position", () => {
      const r = checkPlaylist([
        t("100-A1"),
        t("200-A1"),
        t("100-B1"),
        t("300-A1"),
        t("200-A2"),
        t("100-B2"),
      ]);
      expect(r.repeated_releases).toEqual([
        { release: "100", positions: [1, 3, 6], track_ids: ["100-A1", "100-B1", "100-B2"] },
        { release: "200", positions: [2, 5], track_ids: ["200-A1", "200-A2"] },
      ]);
    });

    it("does not flag distinct releases, including ones with no dash", () => {
      expect(checkPlaylist([t("100-A1"), t("200-A1"), t("solo")]).repeated_releases).toEqual([]);
    });

    it("groups dashless ids by the whole id", () => {
      expect(checkPlaylist([t("solo"), t("solo")]).repeated_releases).toHaveLength(1);
    });
  });

  describe("side order", () => {
    const violations = (ids: string[]) =>
      checkPlaylist(ids.map((id) => t(id))).side_order_violations;

    it("accepts a release played in order, with sides skipped and switching straight to another side", () => {
      expect(violations(["1-A1", "1-A2", "1-B1", "1-D2"])).toEqual([]);
      expect(violations(["1-A2", "1-A10"])).toEqual([]);
    });

    it("flags an earlier position on the same side", () => {
      expect(violations(["1-A2", "1-A1"])).toEqual([
        {
          release: "1",
          position: 2,
          track_id: "1-A1",
          after_track_id: "1-A2",
          reason: "A1 comes after A2 on the same side",
        },
      ]);
    });

    it("sorts a bare side letter before numbered tracks on that side", () => {
      expect(violations(["1-A", "1-A1"])).toEqual([]);
      expect(violations(["1-A1", "1-A"])).toEqual([
        {
          release: "1",
          position: 2,
          track_id: "1-A",
          after_track_id: "1-A1",
          reason: "A comes after A1 on the same side",
        },
      ]);
    });

    it("flags returning to a side already left, even when that side was never played", () => {
      expect(violations(["1-A1", "1-B1", "1-A2"])).toEqual([
        {
          release: "1",
          position: 3,
          track_id: "1-A2",
          after_track_id: "1-B1",
          reason: "side A comes after side B was already played",
        },
      ]);
      expect(violations(["1-B1", "1-A1"])).toHaveLength(1);
    });

    it("tracks each release separately, even interleaved", () => {
      expect(violations(["1-A1", "2-B1", "1-A2", "2-B2", "1-B1", "2-C1"])).toEqual([]);
    });

    it("does not cascade: a misplaced track leaves the last good position in place", () => {
      const v = violations(["1-B2", "1-A1", "1-B3", "1-B1"]);
      expect(v.map((x) => [x.track_id, x.after_track_id])).toEqual([
        ["1-A1", "1-B2"],
        ["1-B1", "1-B3"],
      ]);
    });

    it("ignores ids with no parseable side and does not call a repeat of the same position a violation", () => {
      expect(violations(["1-12", "1-A1", "1-A1", "plain", "plain"])).toEqual([]);
    });

    it("compares sides case-insensitively", () => {
      expect(violations(["1-b1", "1-a1"])).toHaveLength(1);
    });
  });

  it("is ok when nothing is flagged, even with missing data", () => {
    const r = checkPlaylist([
      t("1-A1", { bpm: null, key: null, duration_seconds: null }),
      t("2-A1"),
    ]);
    expect(r.ok).toBe(true);
  });

  it("is not ok for each kind of problem alone", () => {
    expect(checkPlaylist([t("1-A1", { key: "A minor" }), t("2-A1", { key: "C# minor" })]).ok).toBe(
      false,
    );
    expect(checkPlaylist([t("1-A1"), t("1-A2")]).ok).toBe(false);
    expect(checkPlaylist([t("1-B1"), t("2-A1"), t("1-A1")]).ok).toBe(false);
  });
});
