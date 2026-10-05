import { describe, expect, it } from "vitest";
import { trackSearchGetQuerySchema } from "./schemas.js";

describe("trackSearchGetQuerySchema (copy of the app's)", () => {
  it("parses mode and the #412 filters from query-string values", () => {
    expect(
      trackSearchGetQuerySchema.parse({ q: "house", mode: "hybrid", bpm_min: "120", bpm_max: 126.5, key: " A minor ", star_rating: "4" })
    ).toEqual({ q: "house", limit: 20, offset: 0, mode: "hybrid", bpm_min: 120, bpm_max: 126.5, key: "A minor", star_rating: 4 });
  });

  it.each([{ bpm_min: "" }, { bpm_min: "fast" }, { star_rating: "6" }, { mode: "vibes" }])("rejects %j", (input) => {
    expect(trackSearchGetQuerySchema.safeParse(input).success).toBe(false);
  });
});
