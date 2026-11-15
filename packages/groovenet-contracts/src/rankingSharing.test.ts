import { describe, expect, it } from "vitest";
import {
  exportRankingProfileFile,
  parseRankingProfileFile,
  migrateRankingFile,
  MAX_RANKING_FILE_BYTES,
} from "./ranking.js";
const file = {
  format: "groovenet-ranking-profile",
  version: 1,
  name: "Peak",
  description: "Warm",
  author: "dj",
  surfaces: ["playlists"],
  weights: { bpm_distance: 3 },
  constraints: {},
  usePrior: false,
};
describe("portable ranking profiles", () => {
  it("round trips exactly without ids or collection data", () => {
    const parsed = parseRankingProfileFile(JSON.stringify(file)).file;
    const exported = exportRankingProfileFile({ ...parsed, id: "7", kind: "custom" });
    expect(exported).toEqual(file);
    expect(JSON.stringify(parseRankingProfileFile(JSON.stringify(exported)).file)).toBe(
      JSON.stringify(exported),
    );
    expect(exported).not.toHaveProperty("id");
  });
  it("exports optional base signals and omitted authors", () => {
    const parsed = parseRankingProfileFile(file).file;
    const { author: _author, ...anonymous } = parsed;
    void _author;
    const exported = exportRankingProfileFile({
      ...anonymous,
      id: "default",
      kind: "preset",
      base: { combine: "max", signals: ["bpm_distance"] },
    });
    expect(exported).not.toHaveProperty("author");
    expect(exported.base?.signals).toEqual(["bpm_distance"]);
  });
  it("canonicalises weight order after JSONB storage", () => {
    const parsed = parseRankingProfileFile(file).file;
    const profile = { ...parsed, id: "7", kind: "custom" as const };
    const a = exportRankingProfileFile({ ...profile, weights: { rating: 1, bpm_distance: 3 } });
    const b = exportRankingProfileFile({ ...profile, weights: { bpm_distance: 3, rating: 1 } });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it.each([
    ["base scalar", { ...file, base: 1 }, "base"],
    ["base array", { ...file, base: [] }, "base"],
    ["base signals missing", { ...file, base: { combine: "max" } }, "signals"],
    ["weights scalar", { ...file, weights: 1 }, "weights"],
  ])("rejects %s", (_label, input, problem) => {
    expect(() => parseRankingProfileFile(input)).toThrow(problem);
  });
  it("drops unknown signals in weights and base without mutating input", () => {
    const input = {
      ...file,
      weights: { future: 1, bpm_distance: 3 },
      base: { combine: "max", signals: ["future", "bpm_distance"] },
    };
    const result = parseRankingProfileFile(input);
    expect(result.warnings).toEqual(["Dropped unknown signal: future"]);
    expect(result.file.weights).toEqual(file.weights);
    expect(result.file.base?.signals).toEqual(["bpm_distance"]);
    expect(input.weights.future).toBe(1);
  });
  it("builds a pure migration chain, tested with a synthetic v0", () => {
    const older = { ...file, version: 0 };
    expect(migrateRankingFile(older, { 0: (f) => ({ ...f, version: 1 }) })).toEqual(file);
    expect(older.version).toBe(0);
    expect(() => migrateRankingFile(older)).toThrow("No migration");
    expect(() => migrateRankingFile(older, { 0: (f) => ({ ...f }) })).toThrow("Invalid migration");
  });
  it.each([
    ["size", " ".repeat(MAX_RANKING_FILE_BYTES + 1), "exceeds"],
    ["utf8 size", "é".repeat(MAX_RANKING_FILE_BYTES), "exceeds"],
    ["JSON", "{", "Invalid JSON"],
    ["null", null, "object"],
    ["array", [], "object"],
    ["future", { ...file, version: 2 }, "Future schema version"],
    ["version type", { ...file, version: "1" }, "version"],
    ["negative version", { ...file, version: -1 }, "version"],
    ["huge", { ...file, weights: { bpm_distance: 1e300 } }, "weights.bpm_distance"],
    ["NaN", { ...file, weights: { bpm_distance: NaN } }, "Non-finite"],
    ["Infinity", { ...file, weights: { bpm_distance: Infinity } }, "Non-finite"],
    ["name", { ...file, name: "x".repeat(81) }, "name"],
    ["description", { ...file, description: "x".repeat(501) }, "description"],
    ["author", { ...file, author: "x".repeat(65) }, "author"],
    ["string cap", { ...file, name: "x".repeat(1001) }, "String too long"],
    ["extra", { ...file, track_data: {} }, "track_data"],
    ["constraint extra", { ...file, constraints: { bogus: 2 } }, "bogus"],
    [
      "nested extra",
      { ...file, constraints: { bpm_window: { unit: "ratio", max: 0.06, surprise: 1 } } },
      "surprise",
    ],
    ["wrong type", { ...file, weights: [] }, "weights"],
    ["wrong base", { ...file, base: { combine: "max", signals: [1] } }, "base.signals"],
    ["constructor", { ...file, constructor: {} }, "constructor"],
    [
      "proto",
      JSON.stringify(file).replace('"weights":{', '"weights":{"__proto__":0,'),
      "__proto__",
    ],
    ["inherited", Object.create({ hidden: 1 }), "prototype"],
    [
      "deep",
      { ...file, extra: { a: { a: { a: { a: { a: { a: { a: { a: {} } } } } } } } } },
      "deeply nested",
    ],
    ["wide", { ...file, extra: Array(2049).fill(0) }, "Too many fields"],
  ])("rejects %s naming the problem", (_label, input, message) => {
    expect(() => parseRankingProfileFile(input)).toThrow(String(message));
  });
});
