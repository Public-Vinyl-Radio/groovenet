import { describe, expect, it } from "vitest";
import { albumSearchQuerySchema, trackSearchGetQuerySchema } from "../schemas";

describe("trackSearchGetQuerySchema filters (#412)", () => {
  it("parses query-string numbers, decimals included, and trims the key", () => {
    expect(
      trackSearchGetQuerySchema.parse({ bpm_min: "120", bpm_max: " 126.5 ", key: " A minor ", star_rating: "4" })
    ).toMatchObject({ bpm_min: 120, bpm_max: 126.5, key: "A minor", star_rating: 4 });
  });

  it("accepts numbers that are already numbers", () => {
    expect(trackSearchGetQuerySchema.parse({ bpm_min: 98 }).bpm_min).toBe(98);
  });

  it.each([{ bpm_min: "" }, { bpm_max: "fast" }, { bpm_min: "120abc" }, { star_rating: "6" }, { key: "" }])(
    "rejects %j",
    (input) => {
      expect(trackSearchGetQuerySchema.safeParse(input).success).toBe(false);
    }
  );
});

describe("genre query parameter (#375)", () => {
  it("takes one value or several, trimmed", () => {
    expect(trackSearchGetQuerySchema.parse({ genre: " cumbia " }).genre).toEqual(["cumbia"]);
    expect(trackSearchGetQuerySchema.parse({ genre: ["latin", "jazz"] }).genre).toEqual(["latin", "jazz"]);
    expect(albumSearchQuerySchema.parse({ genre: "latin" }).genre).toEqual(["latin"]);
  });

  it.each([{ genre: "" }, { genre: [" "] }, { genre: Array.from({ length: 21 }, (_, i) => `g${i}`) }])(
    "rejects %j",
    (input) => {
      expect(trackSearchGetQuerySchema.safeParse(input).success).toBe(false);
    }
  );
});
