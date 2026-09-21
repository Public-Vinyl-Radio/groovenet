import { describe, expect, it, vi } from "vitest";

vi.mock("@groovenet/client", () => ({
  loadConfig: vi.fn(),
  GroovenetClient: vi.fn(),
}));

import { formatDetection, formatOffset, formatStats } from "./vinyl.js";
import type { DetectionWindow, IngestPipelineStats } from "@groovenet/client";

function window(overrides: Partial<DetectionWindow> = {}): DetectionWindow {
  return {
    id: "d1", ingest_id: "i1", source_id: "aswitch", session_id: "s1",
    window_start_at: "2026-09-21T02:00:00.000Z",
    matched: true, track_id: "t1", friend_id: 1,
    title: "Power", artist: "Ray Barretto", album: "Power",
    confidence: 0.94, offset_seconds: 47.2,
    fingerprint_type: "chromaprint", fingerprint_version: "1",
    created_at: "2026-09-21T02:00:05.000Z",
    ...overrides,
  };
}

function stats(overrides: Partial<IngestPipelineStats> = {}): IngestPipelineStats {
  return {
    since: "2026-09-21T01:00:00Z", window_minutes: 60, source_id: null,
    index: { engine_registered: true, fingerprint_type: "chromaprint",
             fingerprint_version: "1", indexed_tracks: 3783, empty: false },
    queue_depth: 0,
    ingests: { by_status: { processed: 10 }, failures: [], oldest_in_flight: null },
    detections: { windows: 10, matched: 8, no_match: 2, match_rate: 0.8,
                  confidence_bands: [{ band: "0.90-1.00", count: 8 }] },
    ...overrides,
  };
}

const plain = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "");

describe("formatOffset()", () => {
  it("renders seconds as a position in the track", () => {
    expect(formatOffset(47.2)).toBe("0:47");
    expect(formatOffset(125)).toBe("2:05");
  });

  it("handles the very start", () => {
    expect(formatOffset(0)).toBe("0:00");
  });

  it("shows a dash when there is no offset", () => {
    expect(formatOffset(null)).toBe("—");
  });
});

describe("formatDetection()", () => {
  it("shows artist, title, confidence and position", () => {
    const [, track, conf, at] = formatDetection(window()).map(plain);
    expect(track).toBe("Ray Barretto — Power");
    expect(conf).toBe("0.940");
    expect(at).toBe("0:47");
  });

  it("renders a no-match plainly, not as an error", () => {
    // It is the expected state between tracks; colouring it red would train
    // you to ignore red.
    const row = formatDetection(window({ matched: false, artist: null, title: null,
                                         confidence: null, offset_seconds: null }));
    expect(plain(row[1])).toBe("no match");
    expect(row[1]).not.toContain("\u001b[31m");
  });

  it("copes with a match whose track metadata is missing", async () => {
    const row = formatDetection(window({ artist: null, title: null }));
    expect(plain(row[1])).toBe("? — ?");
  });
});

describe("formatStats()", () => {
  it("leads with the index when it is healthy", () => {
    expect(plain(formatStats(stats()))).toContain("✓ index: 3783 tracks");
  });

  it("shouts when the index is empty", () => {
    // The failure that otherwise looks like success.
    const out = plain(formatStats(stats({
      index: { engine_registered: true, fingerprint_type: "chromaprint",
               fingerprint_version: "1", indexed_tracks: 0, empty: true },
    })));

    expect(out).toContain("reference index is EMPTY");
    expect(out).toContain("fingerprint-library");
  });

  it("distinguishes a missing engine from an empty index", () => {
    const out = plain(formatStats(stats({
      index: { engine_registered: false, fingerprint_type: null,
               fingerprint_version: null, indexed_tracks: 0, empty: true },
    })));

    expect(out).toContain("no fingerprint engine registered");
    expect(out).toContain("fingerprint-service");
  });

  it("reports the match rate", () => {
    expect(plain(formatStats(stats()))).toContain("8 matched, 2 no-match (80.0%)");
  });

  it("says so when there were no windows at all", () => {
    const out = plain(formatStats(stats({
      detections: { windows: 0, matched: 0, no_match: 0, match_rate: null,
                    confidence_bands: [] },
    })));
    expect(out).toContain("detections: none in this window");
  });

  it("lists failure reasons", () => {
    const out = plain(formatStats(stats({
      ingests: { by_status: { failed: 3 },
                 failures: [{ error: "decode failed", count: 3 }],
                 oldest_in_flight: null },
    })));
    expect(out).toContain("3× decode failed");
  });

  it("flags an unreachable queue rather than showing zero", () => {
    // Zero depth and "cannot tell" are different, and one is a problem.
    const out = plain(formatStats(stats({ queue_depth: null })));
    expect(out).toContain("queue depth unavailable");
  });

  it("warns about a chunk stuck in flight", () => {
    const out = plain(formatStats(stats({
      ingests: { by_status: {}, failures: [],
                 oldest_in_flight: { ingest_id: "i9", status: "processing",
                                     received_at: "2026-09-21T02:00:00.000Z" } },
    })));
    expect(out).toContain("oldest in flight: processing");
  });

  it("says 'none' rather than nothing for a quiet hour", () => {
    const out = plain(formatStats(stats({
      ingests: { by_status: {}, failures: [], oldest_in_flight: null },
    })));
    expect(out).toContain("ingests (60m): none");
  });
});
