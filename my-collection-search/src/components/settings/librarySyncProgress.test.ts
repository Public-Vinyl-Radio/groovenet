import { describe, expect, it } from "vitest";
import { librarySyncProgress } from "./librarySyncProgress";

describe("librarySyncProgress", () => {
  it("starts before the stream says anything useful", () => {
    expect(librarySyncProgress([], null)).toBe("Starting sync");
    expect(librarySyncProgress(["Loaded manifest IDs for dj: 0"], null)).toBe("Starting sync");
  });

  it("counts releases found while reading the collection", () => {
    const lines = [
      "Found release ID: 1",
      "Found release ID: 2",
      "data:  Page 1 - releases found: 2:",
    ];
    expect(librarySyncProgress(lines, null)).toBe("Reading collection · 2 found");
  });

  it("counts fetched releases, saved or failed, against those to fetch", () => {
    const lines = [
      "Found release ID: 1",
      "New IDs to fetch: 3",
      "Saved release ID: 1",
      "Error for release ID 2: HTTP 500",
    ];
    expect(librarySyncProgress(lines, null)).toBe("Fetching 2 of 3");
  });

  it("reads a sync with nothing new as reading, not fetching", () => {
    expect(librarySyncProgress(["Found release ID: 1", "New IDs to fetch: 0"], null)).toBe(
      "Reading collection · 1 found",
    );
  });

  it("says when it is saving to the library", () => {
    expect(librarySyncProgress(["New IDs to fetch: 1", "--- Starting Auto-Ingest ---"], null)).toBe(
      "Saving to library",
    );
  });

  it("reports a failed sync", () => {
    expect(librarySyncProgress(["Found release ID: 1"], "HTTP 500")).toBe("Sync failed");
  });
});
