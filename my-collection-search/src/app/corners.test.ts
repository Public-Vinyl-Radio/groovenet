import { describe, expect, it } from "vitest";
import { cornerIds, defaultCornerId, resolveCorners } from "./corners";

describe("corners", () => {
  it("defaults to square, the first choice", () => {
    expect(defaultCornerId).toBe("square");
    expect(cornerIds[0]).toBe(defaultCornerId);
  });

  it("resolves a known id and falls back for anything else", () => {
    expect(resolveCorners("rounded")).toBe("rounded");
    expect(resolveCorners("pill")).toBe("square");
    expect(resolveCorners(undefined)).toBe("square");
  });
});
