import { describe, expect, it } from "vitest";
import {
  currentMonth,
  formatMonthLabel,
  formatMonthName,
  monthBounds,
  resolveMonth,
  shiftMonth,
} from "./spinMonth";

describe("currentMonth", () => {
  it("uses the configured zone, not UTC", () => {
    // 05:00 UTC on Nov 1 is still Oct 31 in Los Angeles.
    const now = new Date("2026-11-01T05:00:00Z");
    expect(currentMonth("America/Los_Angeles", now)).toBe("2026-10");
    expect(currentMonth("UTC", now)).toBe("2026-11");
  });
});

describe("resolveMonth", () => {
  it("keeps a valid past month and falls back to the latest otherwise", () => {
    expect(resolveMonth("2026-09", "2026-10")).toBe("2026-09");
    expect(resolveMonth("2026-12", "2026-10")).toBe("2026-10");
    expect(resolveMonth("2026-13", "2026-10")).toBe("2026-10");
    expect(resolveMonth("0000-01", "2026-10")).toBe("2026-10");
    expect(resolveMonth(null, "2026-10")).toBe("2026-10");
  });
});

describe("shiftMonth", () => {
  it("crosses year boundaries both ways", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-10", 0)).toBe("2026-10");
  });

  it("rejects a malformed month", () => {
    expect(() => shiftMonth("oct", 1)).toThrow("Invalid month");
  });
});

describe("monthBounds", () => {
  it("runs from local midnight on the 1st to just before the next month", () => {
    // October 2026 in Los Angeles is PDT at the start and PST (from Nov 1) at the end.
    expect(monthBounds("2026-10", "America/Los_Angeles")).toEqual({
      from: "2026-10-01T07:00:00.000Z",
      to: "2026-11-01T06:59:59.999Z",
    });
    expect(monthBounds("2026-12", "UTC")).toEqual({
      from: "2026-12-01T00:00:00.000Z",
      to: "2026-12-31T23:59:59.999Z",
    });
  });

  it("handles a zone ahead of UTC", () => {
    expect(monthBounds("2026-03", "Asia/Tokyo").from).toBe("2026-02-28T15:00:00.000Z");
  });

  it("rejects a malformed month", () => {
    expect(() => monthBounds("2026-1", "UTC")).toThrow("Invalid month");
  });
});

describe("formatMonthLabel", () => {
  it("names the month in full or short", () => {
    expect(formatMonthLabel("2026-10")).toBe("OCTOBER 2026");
    expect(formatMonthLabel("2026-10", true)).toBe("OCT 2026");
    expect(formatMonthName("2026-10")).toBe("OCTOBER");
    expect(formatMonthLabel("bad")).toBe("bad");
  });
});
