import { describe, expect, it } from "vitest";
import {
  bpmJumpTotal,
  keyClashCount,
  orderingMetrics,
  vibeDistanceTotal,
} from "../orderingMetrics";

// The same playlist as ga-service's test_metrics_skip_transitions_missing_data.
const tracks = [
  { bpm: 120, key: "8A", embedding: "[1, 0]" },
  { bpm: "126", key: "3B", embedding: [0, 1] },
  { bpm: null, key: null, embedding: [0, 0] },
  { bpm: "fast", key: "2B", embedding: [0, 0] },
  { bpm: 100, key: "3B", embedding: [1, 0, 0] },
  { bpm: 98, key: "4B", embedding: [] },
  { embedding: null },
];

describe("ordering metrics", () => {
  it("skip transitions where either side lacks the data", () => {
    expect(bpmJumpTotal(tracks)).toBe(8);
    expect(keyClashCount(tracks)).toBe(1);
    expect(vibeDistanceTotal(tracks)).toBeCloseTo(1);
    expect(orderingMetrics(tracks)).toEqual({
      transitions: 6,
      bpmJumps: 8,
      keyClashes: 1,
      vibeDistance: expect.closeTo(1),
    });
  });

  it("read spelled keys and count relative major/minor as no clash", () => {
    expect(keyClashCount([{ key: "A minor" }, { key: "C major" }, { key: "G major" }])).toBe(0);
    expect(keyClashCount([{ key: "A minor" }, { key: "D major" }])).toBe(1);
  });

  it("measure half and double time as close when asked", () => {
    const halfTime = [{ bpm: 124 }, { bpm: 63 }, { bpm: 120 }];
    expect(bpmJumpTotal(halfTime)).toBe(118);
    expect(bpmJumpTotal(halfTime, { halfDouble: true })).toBe(5);
    expect(orderingMetrics([{ bpm: 90 }, { bpm: 181 }], { halfDouble: true }).bpmJumps).toBe(0.5);
  });

  it("are zero for an empty or one-track ordering", () => {
    expect(orderingMetrics([])).toEqual({
      transitions: 0,
      bpmJumps: 0,
      keyClashes: 0,
      vibeDistance: 0,
    });
    expect(orderingMetrics([tracks[0]]).transitions).toBe(0);
  });
});
