import { describe, expect, it } from "vitest";
import { trackPositionFact } from "./albumTrackPosition";

describe("trackPositionFact", () => {
  it.each([
    ["A1", "Side", "A1"],
    ["b3", "Side", "b3"],
    ["AA2", "Side", "AA2"],
    ["C", "Side", "C"],
    ["9", "Track", "9"],
    [9, "Track", "9"],
    ["1-9", "Track", "1-9"],
  ])("names %s as %s", (position, label, value) => {
    expect(trackPositionFact(position)).toEqual({ label, value });
  });

  it("has no value for a missing position", () => {
    expect(trackPositionFact(null)).toEqual({ label: "Track", value: null });
    expect(trackPositionFact("  ")).toEqual({ label: "Track", value: null });
  });
});
