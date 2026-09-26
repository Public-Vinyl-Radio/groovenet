import { describe, expect, it } from "vitest";
import { formatLevel } from "../audioLevel";

describe("formatLevel", () => {
  it("rounds to whole decibels", () => {
    expect(formatLevel(-23.4)).toBe("-23 dB");
    expect(formatLevel(-71.6)).toBe("-72 dB");
    expect(formatLevel(0)).toBe("0 dB");
  });

  it("shows a dash when no level was recorded", () => {
    expect(formatLevel(null)).toBe("—");
    expect(formatLevel(undefined)).toBe("—");
  });
});
