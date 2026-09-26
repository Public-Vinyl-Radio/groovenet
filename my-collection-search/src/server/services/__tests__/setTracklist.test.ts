import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  derivePlays,
  diffAgainstPlan,
  findUnidentified,
  identifiedSeconds,
} from "../setTracklist";
import type { PlannedEntry, SetWindow } from "@/types/setDerivation";

/** Consecutive 15 s windows of one track, starting at `from` seconds. */
function run(trackId: string, from: number, count: number, offsetAt = 0, confidence = 0.9): SetWindow[] {
  return Array.from({ length: count }, (_, i) => ({
    start_seconds: from + i * 15,
    duration_seconds: 15,
    candidates: [{ track_id: trackId, friend_id: 1, confidence, offset_seconds: offsetAt + i * 15 }],
  }));
}

function silence(from: number, count: number): SetWindow[] {
  return Array.from({ length: count }, (_, i) => ({
    start_seconds: from + i * 15,
    duration_seconds: 15,
    candidates: [],
  }));
}

function planned(index: number, trackId: string, releaseId: string | null, fingerprinted = true): PlannedEntry {
  return {
    index, track_id: trackId, friend_id: 1, title: trackId, artist: "a",
    release_id: releaseId, position: trackId.split("-")[1] ?? null, fingerprinted,
  };
}

function play(trackId: string, releaseId: string | null = trackId.split("-")[0]) {
  return { track_id: trackId, friend_id: 1, track: { release_id: releaseId } };
}

describe("derivePlays", () => {
  it("groups consecutive windows of one track into one play", () => {
    const plays = derivePlays([...run("1-A1", 0, 4), ...run("2-B1", 60, 3)]);
    expect(plays).toEqual([
      expect.objectContaining({ track_id: "1-A1", start_seconds: 0, end_seconds: 60, windows: 4 }),
      expect.objectContaining({ track_id: "2-B1", start_seconds: 60, end_seconds: 105, windows: 3 }),
    ]);
  });

  it("bridges a missed window or two, as #279 does", () => {
    const plays = derivePlays([...run("1-A1", 0, 3), ...silence(45, 2), ...run("1-A1", 75, 3, 75)]);
    expect(plays).toHaveLength(1);
  });

  it("splits a track across an unidentified stretch longer than the gap", () => {
    const plays = derivePlays([...run("1-A1", 0, 3), ...silence(45, 10), ...run("1-A1", 195, 3, 195)]);
    expect(plays.map((p) => p.start_seconds)).toEqual([0, 195]);
  });

  it("reports the rate the track advanced against the recording", () => {
    // 540 s of wall clock against 540.7 s of track — #271's 9m30s play.
    const windows = run("1-A1", 0, 37).map((w, i) => ({
      ...w,
      candidates: [{ ...w.candidates[0], offset_seconds: i * 15 * (540.7 / 540) }],
    }));
    expect(derivePlays(windows)[0].rate).toBeCloseTo(1.0013, 3);
  });

  it("has no rate for a single-window play", () => {
    expect(derivePlays(run("1-A1", 0, 1))[0].rate).toBeNull();
  });

  it("splits when the offset jumps: the record was dropped back to the start", () => {
    const plays = derivePlays([...run("1-A1", 0, 4, 0), ...run("1-A1", 60, 5, 0)]);
    expect(plays.map((p) => p.start_seconds)).toEqual([0, 60]);
  });

  it("tolerates drift within the limit", () => {
    const plays = derivePlays([...run("1-A1", 0, 4, 0), ...run("1-A1", 60, 4, 70)], { maxDriftSeconds: 20 });
    expect(plays).toHaveLength(1);
  });

  it("cannot judge drift without offsets, so does not split on it", () => {
    const windows = run("1-A1", 0, 4).map((w) => ({
      ...w,
      candidates: [{ ...w.candidates[0], offset_seconds: null as unknown as number }],
    }));
    expect(derivePlays(windows, { maxDriftSeconds: 1 })).toHaveLength(1);
  });

  it("ignores low-confidence windows", () => {
    expect(derivePlays(run("1-A1", 0, 3, 0, 0.5))).toEqual([]);
  });

  it("orders windows by time even if they arrive out of order", () => {
    const windows = run("1-A1", 0, 3).reverse();
    expect(derivePlays(windows)).toHaveLength(1);
  });

  it("keeps the highest confidence of the play", () => {
    const windows = run("1-A1", 0, 2);
    windows[1].candidates[0].confidence = 0.97;
    expect(derivePlays(windows)[0].confidence).toBe(0.97);
  });
});

/**
 * One window on a given alignment: `anchor` is where on the recording the
 * track would have started, so offset = start - anchor.
 */
function at(trackId: string, start: number, anchor: number): SetWindow {
  return {
    start_seconds: start,
    duration_seconds: 15,
    candidates: [{ track_id: trackId, friend_id: 1, confidence: 0.9, offset_seconds: Math.max(0, start - anchor) }],
  };
}

/** Windows every 15 s from `from`, all on `anchor`. */
function line(trackId: string, from: number, count: number, anchor: number): SetWindow[] {
  return Array.from({ length: count }, (_, i) => at(trackId, from + i * 15, anchor));
}

describe("derivePlays on repetitive music (#282)", () => {
  // Loop-based tracks sometimes match a *repeat* of the same section: one or
  // two windows jump to another alignment, then the play carries on. On
  // #271's set that split three tracks into eleven plays.

  it("absorbs a single window that matched a repeat", () => {
    const windows = [...line("1-A1", 0, 8, 0), at("1-A1", 120, 56), ...line("1-A1", 135, 8, 0)];
    expect(derivePlays(windows)).toHaveLength(1);
  });

  it("absorbs two windows that matched the same repeat", () => {
    // Cuco — Lover Is A Day: 7775 and 7790 s both at anchor 7469.8.
    const windows = [...line("1-A1", 0, 3, 0), at("1-A1", 45, -256), at("1-A1", 60, -256), ...line("1-A1", 75, 7, 0)];
    expect(derivePlays(windows)).toEqual([expect.objectContaining({ windows: 12, start_seconds: 0, end_seconds: 180 })]);
  });

  it("absorbs stray windows that do not agree with each other, up to the end of the track", () => {
    // Tame Impala: two windows at one repeat, then one at another, then the next record.
    const windows = [...line("1-A1", 0, 10, 0), at("1-A1", 150, -28), at("1-A1", 165, -28), at("1-A1", 180, 28), ...line("2-B1", 195, 4, 195)];
    expect(derivePlays(windows).map((p) => [p.track_id, p.windows])).toEqual([["1-A1", 13], ["2-B1", 4]]);
  });

  it("splits a record really dropped back to the start, from the first window of the restart", () => {
    const windows = [...line("1-A1", 0, 8, 0), ...line("1-A1", 120, 6, 120)];
    // 120 s is at offset 0, the needle drop: alignment unknown on its own, it
    // still belongs to the restart, not to the play before.
    expect(derivePlays(windows).map((p) => [p.start_seconds, p.windows])).toEqual([[0, 8], [120, 6]]);
  });

  it("needs driftConfirmWindows agreeing windows to split", () => {
    const threeOff = [...line("1-A1", 0, 8, 0), ...line("1-A1", 120, 4, 120), ...line("1-A1", 180, 2, 0)];
    expect(derivePlays(threeOff)).toHaveLength(1);
    expect(derivePlays(threeOff, { driftConfirmWindows: 3 })).toHaveLength(2);
  });

  it("follows the play's alignment rather than its first, clamped, window", () => {
    // The first window starts before the needle drop, so its offset is
    // clamped to 0 and its anchor is a few seconds off the real one.
    const windows = [at("1-A1", 0, 4.4), ...line("1-A1", 15, 10, 4.4)];
    expect(windows[0].candidates[0].offset_seconds).toBe(0);
    expect(derivePlays(windows, { maxDriftSeconds: 3 })).toHaveLength(1);
  });
});

describe("derivePlays on the #271 set (real matcher output)", () => {
  const fixture = JSON.parse(
    readFileSync(path.join(__dirname, "fixtures", "set-271-windows.json"), "utf8")
  ) as { duration_seconds: number; windows: Array<[number, number, string | null, number | null, number | null, number | null]> };
  const windows: SetWindow[] = fixture.windows.map(([start, duration, trackId, friendId, confidence, offset]) => ({
    start_seconds: start,
    duration_seconds: duration,
    candidates: trackId
      ? [{ track_id: trackId, friend_id: friendId as number, confidence: confidence as number, offset_seconds: offset as number }]
      : [],
  }));
  const plays = derivePlays(windows);

  it("groups the set into 41 plays", () => {
    // 49 before repeats were absorbed. Of the 41, the only track appearing in
    // two adjacent plays is Massive Attack's two low-confidence windows 75 s
    // apart — separated by the gap rule, not by drift.
    expect(plays).toHaveLength(41);
    const adjacentRepeats = plays.filter((p, i) => i > 0 && plays[i - 1].track_id === p.track_id);
    expect(adjacentRepeats.map((p) => p.track_id)).toEqual(["5077187-B2"]);
  });

  it.each([
    ["14539820-B3", "Punta Diamante — Champ Fire"],
    ["21303601-D2", "Tame Impala — I Don't Really Mind"],
    ["23156720-A1", "Cuco — Lover Is A Day"],
  ])("keeps %s (%s) as one play", (trackId) => {
    expect(plays.filter((p) => p.track_id === trackId)).toHaveLength(1);
  });

  it("identifies nearly the whole set", () => {
    expect(identifiedSeconds(plays) / fixture.duration_seconds).toBeGreaterThan(0.98);
  });
});

describe("findUnidentified", () => {
  it("reports stretches between, before and after plays", () => {
    const plays = [
      { start_seconds: 90, end_seconds: 300 },
      { start_seconds: 450, end_seconds: 600 },
    ];
    expect(findUnidentified(plays, 700)).toEqual([
      { start_seconds: 0, end_seconds: 90, before: null, after: 0 },
      { start_seconds: 300, end_seconds: 450, before: 0, after: 1 },
      { start_seconds: 600, end_seconds: 700, before: 1, after: null },
    ]);
  });

  it("does not report a transition-length gap", () => {
    const plays = [
      { start_seconds: 0, end_seconds: 300 },
      { start_seconds: 330, end_seconds: 600 },
    ];
    expect(findUnidentified(plays, 600)).toEqual([]);
  });

  it("reports the whole recording when nothing matched", () => {
    expect(findUnidentified([], 3600)).toEqual([
      { start_seconds: 0, end_seconds: 3600, before: null, after: null },
    ]);
  });

  it("honours a custom minimum", () => {
    const plays = [{ start_seconds: 20, end_seconds: 100 }];
    expect(findUnidentified(plays, 100, 10)).toEqual([
      { start_seconds: 0, end_seconds: 20, before: null, after: 0 },
    ]);
  });
});

describe("identifiedSeconds", () => {
  it("sums play spans without double counting overlap", () => {
    expect(
      identifiedSeconds([
        { start_seconds: 0, end_seconds: 100 },
        { start_seconds: 90, end_seconds: 150 },
        { start_seconds: 200, end_seconds: 250 },
      ])
    ).toBe(200);
  });

  it("ignores a play entirely inside another", () => {
    expect(
      identifiedSeconds([
        { start_seconds: 0, end_seconds: 100 },
        { start_seconds: 10, end_seconds: 20 },
      ])
    ).toBe(100);
  });
});

describe("diffAgainstPlan", () => {
  /**
   * A miniature of playlist #176 and what #271 found: one substitution on the
   * same record, one planned record never played, two tracks swapped, and one
   * record resumed after a gap.
   */
  const plan = [
    planned(0, "10-A1", "10"),
    planned(1, "11-A5", "11"), // played as 11-A6 instead
    planned(2, "12-A", "12"), // never played
    planned(3, "13-B1", "13"),
    planned(4, "14-B1", "14"), // swapped with 13-B1
    planned(5, "15-A1", "15"), // played in two stretches
  ];
  const plays = [
    play("10-A1"),
    play("11-A6"),
    play("14-B1"),
    play("13-B1"),
    play("15-A1"),
    play("15-A1"),
    play("99-X1"),
  ];
  const diff = diffAgainstPlan(plays, plan, 176);

  it("names a same-release substitution as played-instead-of, not two events", () => {
    expect(diff.played_instead_of).toEqual([{ play: 1, planned: plan[1] }]);
    expect(diff.planned_not_played.map((p) => p.track_id)).toEqual(["12-A"]);
    expect(diff.played_not_planned).toEqual([{ play: 6 }]);
  });

  it("counts a record resumed after a gap as the same planned slot", () => {
    const resumed = diff.played_as_planned.filter((m) => m.planned.track_id === "15-A1");
    expect(resumed.map((m) => m.play)).toEqual([4, 5]);
  });

  it("flags a track played out of the plan's order", () => {
    const flags = Object.fromEntries(
      diff.played_as_planned.map((m) => [`${m.play}:${m.planned.track_id}`, m.out_of_order])
    );
    // 13-B1 and 14-B1 swapped: one of the two is outside the longest in-order run.
    expect(flags["2:14-B1"] !== flags["3:13-B1"]).toBe(true);
    expect(flags["0:10-A1"]).toBe(false);
    expect(flags["4:15-A1"]).toBe(false);
  });

  it("carries the playlist id", () => {
    expect(diff.playlist_id).toBe(176);
  });

  it("pairs with the unplayed entry nearest where the play happened", () => {
    const twoOnOneRecord = [
      planned(0, "20-A1", "20"),
      planned(1, "30-A1", "30"),
      planned(2, "30-A2", "30"),
      planned(3, "40-A1", "40"),
      planned(4, "30-B1", "30"),
    ];
    const result = diffAgainstPlan(
      [play("20-A1"), play("30-A1"), play("30-A2"), play("40-A1"), play("30-B9")],
      twoOnOneRecord,
      1
    );
    expect(result.played_instead_of).toEqual([{ play: 4, planned: twoOnOneRecord[4] }]);
  });

  it("prefers a later candidate when it is nearer where the play happened", () => {
    const plan = [planned(0, "30-A1", "30"), planned(1, "20-A1", "20"), planned(2, "30-B1", "30")];
    const result = diffAgainstPlan([play("20-A1"), play("30-X9")], plan, 1);
    expect(result.played_instead_of).toEqual([{ play: 1, planned: plan[2] }]);
  });

  it("keeps the first candidate when it is already the nearest", () => {
    const plan = [planned(0, "30-A1", "30"), planned(1, "20-A1", "20"), planned(2, "30-B1", "30")];
    const result = diffAgainstPlan([play("30-X9")], plan, 1);
    expect(result.played_instead_of).toEqual([{ play: 0, planned: plan[0] }]);
  });

  it("does not pair across releases or when the play's release is unknown", () => {
    const result = diffAgainstPlan([play("50-A1", null), play("60-A1")], [planned(0, "70-A1", "70")], 1);
    expect(result.played_instead_of).toEqual([]);
    expect(result.played_not_planned).toEqual([{ play: 0 }, { play: 1 }]);
    expect(result.planned_not_played).toHaveLength(1);
  });

  it("keeps a substitution's pairing when the same track comes back", () => {
    // Massive Attack on #271: B2 matched twice, 75 s apart, where D2 was
    // planned. Both are that slot — not one instead-of and one unplanned.
    const plan = [planned(0, "1-A1", "1"), planned(1, "5-D2", "5")];
    const result = diffAgainstPlan([play("1-A1"), play("5-B2"), play("5-B2")], plan, 1);
    expect(result.played_instead_of).toEqual([
      { play: 1, planned: plan[1] },
      { play: 2, planned: plan[1] },
    ]);
    expect(result.played_not_planned).toEqual([]);
  });

  it("does not pair across friends", () => {
    const other = { ...play("11-A6"), friend_id: 2 };
    const result = diffAgainstPlan([other], [planned(0, "11-A5", "11")], 1);
    expect(result.played_instead_of).toEqual([]);
  });

  it("places a substitution before any matched play at the start of the plan", () => {
    const result = diffAgainstPlan(
      [play("1-A2"), play("2-A1")],
      [planned(0, "1-A1", "1"), planned(1, "2-A1", "2"), planned(2, "1-B1", "1")],
      1
    );
    expect(result.played_instead_of[0].planned.track_id).toBe("1-A1");
  });

  it("matches a track planned twice to each slot in turn", () => {
    const result = diffAgainstPlan(
      [play("1-A1"), play("2-A1"), play("1-A1")],
      [planned(0, "1-A1", "1"), planned(1, "2-A1", "2"), planned(2, "1-A1", "1")],
      1
    );
    expect(result.played_as_planned.map((m) => m.planned.index)).toEqual([0, 1, 2]);
    expect(result.planned_not_played).toEqual([]);
  });

  it("an empty set played nothing from the plan", () => {
    const result = diffAgainstPlan([], plan, 1);
    expect(result.planned_not_played).toHaveLength(plan.length);
  });
});
