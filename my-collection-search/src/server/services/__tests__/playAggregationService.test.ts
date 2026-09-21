import { describe, expect, it, vi } from "vitest";
const { listRecentBySource, findAutomaticSessionByDetectionId, createAutomaticSpinSession } = vi.hoisted(() => ({
  listRecentBySource: vi.fn(), findAutomaticSessionByDetectionId: vi.fn(), createAutomaticSpinSession: vi.fn(),
}));
vi.mock("@/server/repositories/playDetectionRepository", () => ({ playDetectionRepository: { listRecentBySource } }));
vi.mock("@/server/services/spinLoggingService", () => ({ spinLoggingService: { findAutomaticSessionByDetectionId, createAutomaticSpinSession } }));
import { groupDetections, PlayAggregationService } from "../playAggregationService";
import type { PlayDetectionRow } from "@/types/playDetection";

function detection(overrides: Partial<PlayDetectionRow> = {}): PlayDetectionRow {
  return {
    id: "d1", ingest_id: "i1", source_id: "listener", session_id: null,
    track_id: "track-a", friend_id: 1, confidence: 0.9, offset_seconds: null,
    window_start_at: "2026-09-20T12:00:00Z", fingerprint_type: "chromaprint",
    fingerprint_version: "1", created_at: "2026-09-20T12:00:00Z", ...overrides,
  };
}

describe("groupDetections", () => {
  it("groups repeated detections of one track into one play", () => {
    const plays = groupDetections([
      detection(), detection({ id: "d2", window_start_at: "2026-09-20T12:00:15Z" }),
    ]);
    expect(plays).toHaveLength(1);
    expect(plays[0]).toMatchObject({ confidence: 0.9, first: { id: "d1" }, last: { id: "d2" } });
  });

  it("starts a new play after the configured gap", () => {
    const plays = groupDetections([
      detection(), detection({ id: "d2", window_start_at: "2026-09-20T12:01:00Z" }),
    ], { gapSeconds: 45 });
    expect(plays).toHaveLength(2);
  });

  it("does not let an unmatched or low-confidence window create a play", () => {
    expect(groupDetections([
      detection({ track_id: null, friend_id: null, confidence: null }),
      detection({ id: "low", confidence: 0.5 }),
    ], { confidenceFloor: 0.75 })).toEqual([]);
  });

  it("splits a play when the detected track changes", () => {
    expect(groupDetections([
      detection(), detection({ id: "d2", track_id: "track-b" }),
    ])).toHaveLength(2);
  });

  it("creates only plays that have not already been aggregated", async () => {
    listRecentBySource.mockResolvedValue([detection(), detection({ id: "d2", track_id: "track-b", window_start_at: "2026-09-20T12:00:15Z" })]);
    findAutomaticSessionByDetectionId.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(null);
    const result = await new PlayAggregationService().aggregateSource("listener", "2026-09-20T11:00:00Z");
    expect(result).toEqual({ created: 1, skipped: 1 });
    expect(createAutomaticSpinSession).toHaveBeenCalledWith(expect.objectContaining({ detection_id: "d2", source_id: "listener", track_id: "track-b" }));
  });
});
