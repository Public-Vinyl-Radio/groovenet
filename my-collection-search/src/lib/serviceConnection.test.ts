import { describe, expect, it } from "vitest";
import { serviceNotRunning } from "./serviceConnection";

describe("serviceNotRunning", () => {
  it("recognizes refused connections and missing Compose DNS names", () => {
    expect(
      serviceNotRunning(new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } })),
    ).toBe(true);
    expect(serviceNotRunning(new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } }))).toBe(
      true,
    );
  });

  it("leaves other failures alone", () => {
    expect(serviceNotRunning(null)).toBe(false);
    expect(serviceNotRunning(new Error("other"))).toBe(false);
    expect(serviceNotRunning(new Error("other", { cause: { code: "ETIMEDOUT" } }))).toBe(false);
    expect(serviceNotRunning(new Error("other", { cause: {} }))).toBe(false);
  });
});
