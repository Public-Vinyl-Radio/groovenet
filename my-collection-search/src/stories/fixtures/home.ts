import type { HomeResponse } from "@/services/internalApi/home";
import type { DetectionsRecentResponse } from "@/services/internalApi/vinylPipeline";

// The Home artboards' sample data (HomeDesktop / HomePhone, #881).

/** The instant the fixtures are relative to: an evening at the end of October. */
export const FIXTURE_NOW = "2026-10-31T20:00:00.000Z";

export const HOME_COUNTS: HomeResponse["counts"] = { tracks: 4044, albums: 312, playlists: 18 };

type Detection = DetectionsRecentResponse["detections"][number];

/** A matched window heard a minute before `FIXTURE_NOW`. */
export function vinylDetection(patch: Partial<Detection> = {}): Detection {
  const now = Date.parse(FIXTURE_NOW);
  return {
    id: "d1",
    ingest_id: "i1",
    source_id: "aswitch",
    session_id: null,
    window_start_at: new Date(now - 60_000).toISOString(),
    matched: true,
    track_id: "t1",
    friend_id: 1,
    title: "Flaca",
    artist: "Andrés Calamaro",
    album: "Alta Suciedad",
    confidence: 0.9,
    offset_seconds: 30,
    level_dbfs: -18,
    fingerprint_type: "chromaprint",
    fingerprint_version: "1",
    created_at: new Date(now - 50_000).toISOString(),
    ...patch,
  };
}
