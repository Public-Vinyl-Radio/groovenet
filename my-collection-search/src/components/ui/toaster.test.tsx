import { describe, expect, it } from "vitest";
import { toastOffsets } from "./toaster";

describe("toast offsets", () => {
  it("lifts toasts 12px above the bottom chrome, so they never cover the tab bar or player", () => {
    expect(toastOffsets.bottom).toBe("calc(var(--chrome-bottom, 0px) + 12px)");
  });

  it("keeps the usual inset on the other edges", () => {
    expect(toastOffsets).toMatchObject({ top: "1rem", left: "1rem", right: "1rem" });
  });
});
