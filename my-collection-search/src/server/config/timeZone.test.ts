import { afterEach, describe, expect, it, vi } from "vitest";
import { getDisplayTimeZone } from "./timeZone";

describe("getDisplayTimeZone", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns a valid configured zone, read at call time", () => {
    vi.stubEnv("GROOVENET_TIME_ZONE", "America/Los_Angeles");
    expect(getDisplayTimeZone()).toBe("America/Los_Angeles");
    vi.stubEnv("GROOVENET_TIME_ZONE", "Europe/Berlin");
    expect(getDisplayTimeZone()).toBe("Europe/Berlin");
  });

  it("defaults to UTC when unset or blank", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("GROOVENET_TIME_ZONE", undefined);
    expect(getDisplayTimeZone()).toBe("UTC");
    vi.stubEnv("GROOVENET_TIME_ZONE", "  ");
    expect(getDisplayTimeZone()).toBe("UTC");
    expect(warn).not.toHaveBeenCalled();
  });

  it("falls back to UTC with one warning for an invalid zone", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("GROOVENET_TIME_ZONE", "Mars/Olympus_Mons");
    expect(getDisplayTimeZone()).toBe("UTC");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("Mars/Olympus_Mons");
  });
});
