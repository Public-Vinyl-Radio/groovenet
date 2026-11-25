import { describe, expect, it } from "vitest";
import {
  discogsImportCreateResponseSchema,
  discogsImportCreateSchema,
  discogsImportJsonSchemas,
  discogsImportListResponseSchema,
  discogsImportLogResponseSchema,
  isDiscogsImportActive,
} from "./discogsImports.js";

const row = {
  id: 1,
  username: "saegey",
  status: "running",
  phase: "fetching",
  found: 40,
  total: 12,
  fetched: 3,
  added: 0,
  removed: 0,
  failed_releases: 0,
  last_error: null,
  attempts: 1,
  stalled: false,
  created_at: "2026-11-24T10:00:00.000Z",
  started_at: "2026-11-24T10:00:01.000Z",
  updated_at: "2026-11-24T10:00:05.000Z",
  finished_at: null,
};

describe("Discogs import contracts", () => {
  it("validates an import and rejects an unknown status", () => {
    expect(discogsImportCreateResponseSchema.parse({ import: row, created: true }).import.id).toBe(
      1,
    );
    expect(
      discogsImportListResponseSchema.safeParse({ imports: [{ ...row, status: "paused" }] })
        .success,
    ).toBe(false);
  });

  it("takes an optional, trimmed username", () => {
    expect(discogsImportCreateSchema.parse({})).toEqual({});
    expect(discogsImportCreateSchema.parse({ username: " dj " })).toEqual({ username: "dj" });
    expect(discogsImportCreateSchema.safeParse({ username: "" }).success).toBe(false);
  });

  it("reads log pages", () => {
    expect(
      discogsImportLogResponseSchema.parse({ lines: [{ id: 3, line: "x" }], next_after: 3 })
        .next_after,
    ).toBe(3);
  });

  it("treats queued and running as active", () => {
    expect(isDiscogsImportActive("queued")).toBe(true);
    expect(isDiscogsImportActive("running")).toBe(true);
    expect(isDiscogsImportActive("completed")).toBe(false);
    expect(isDiscogsImportActive("interrupted")).toBe(false);
  });

  it("exports JSON schemas for OpenAPI", () => {
    expect(Object.keys(discogsImportJsonSchemas)).toContain("DiscogsImport");
  });
});
