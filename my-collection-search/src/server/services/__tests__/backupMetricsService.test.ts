import { describe, expect, it } from "vitest";
import { parseSnapshots } from "../backupMetricsService";

describe("parseSnapshots", () => {
  it("sorts valid Restic snapshots newest first and discards malformed entries", () => {
    const snapshots = parseSnapshots(JSON.stringify([
      { id: "older", time: "2026-09-17T00:00:00Z", hostname: "host", paths: ["/app/audio"], tags: ["scheduled"] },
      { id: "newer", short_id: "newer", time: "2026-09-18T00:00:00Z", hostname: "host", paths: ["/app/dumps"], tags: [] },
      { id: 42, time: "2026-09-19T00:00:00Z" },
    ]));

    expect(snapshots).toHaveLength(2);
    expect(snapshots.map((snapshot) => snapshot.id)).toEqual(["newer", "older"]);
    expect(snapshots[1]).toMatchObject({ short_id: null, tags: ["scheduled"] });
  });

  it("returns no snapshots for a non-array JSON document", () => {
    expect(parseSnapshots(JSON.stringify({ id: "not-an-array" }))).toEqual([]);
  });
});
