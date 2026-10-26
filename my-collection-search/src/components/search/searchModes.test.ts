import { describe, expect, it } from "vitest";
import { isTrackSearchMode } from "./searchModes";

describe("isTrackSearchMode", () => {
  it("accepts only the three modes", () => {
    expect(isTrackSearchMode("hybrid")).toBe(true);
    expect(isTrackSearchMode("vibes")).toBe(false);
    expect(isTrackSearchMode(null)).toBe(false);
  });
});
