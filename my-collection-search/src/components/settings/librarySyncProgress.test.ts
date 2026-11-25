import { describe, expect, it } from "vitest";
import type { DiscogsImport } from "@/services/internalApi/discogsImports";
import { librarySyncProgress } from "./librarySyncProgress";

const job = (patch: Partial<DiscogsImport> = {}): DiscogsImport => ({
  id: 1,
  username: "dj",
  status: "running",
  phase: "listing",
  found: 0,
  total: null,
  fetched: 0,
  added: 0,
  removed: 0,
  failed_releases: 0,
  last_error: null,
  attempts: 1,
  stalled: false,
  created_at: "2026-11-24T10:00:00.000Z",
  started_at: null,
  updated_at: "2026-11-24T10:00:00.000Z",
  finished_at: null,
  ...patch,
});

describe("librarySyncProgress", () => {
  it("starts before the import has said anything useful", () => {
    expect(librarySyncProgress(null)).toBe("Starting sync");
    expect(librarySyncProgress(job())).toBe("Starting sync");
  });

  it("says an import waiting its turn is queued", () => {
    expect(librarySyncProgress(job({ status: "queued", phase: "queued" }))).toBe("Queued");
  });

  it("counts releases found while reading the collection", () => {
    expect(librarySyncProgress(job({ found: 2400 }))).toBe("Reading collection · 2,400 found");
  });

  it("counts fetched releases against those to fetch, never past the total", () => {
    expect(librarySyncProgress(job({ phase: "fetching", found: 9, total: 3, fetched: 2 }))).toBe(
      "Fetching 2 of 3",
    );
    expect(librarySyncProgress(job({ phase: "fetching", total: 3, fetched: 5 }))).toBe(
      "Fetching 3 of 3",
    );
  });

  it("reads an import with nothing new as reading, not fetching", () => {
    expect(librarySyncProgress(job({ phase: "fetching", found: 1, total: 0 }))).toBe(
      "Reading collection · 1 found",
    );
  });

  it("says when it is saving the last batch", () => {
    expect(librarySyncProgress(job({ phase: "ingesting", total: 3, fetched: 3 }))).toBe(
      "Saving to library",
    );
  });

  it("says an import whose process stopped is resuming", () => {
    expect(librarySyncProgress(job({ stalled: true, phase: "fetching", total: 4 }))).toBe(
      "Resuming after a restart",
    );
  });

  it("reports a failed or interrupted import as failed", () => {
    expect(librarySyncProgress(job({ status: "failed" }))).toBe("Sync failed");
    expect(librarySyncProgress(job({ status: "interrupted" }))).toBe("Sync failed");
  });
});
