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

/** The Home artboards' ARRIVALS, as the API returns them: least played first. */
export const HOME_ARRIVALS: HomeResponse["new_arrivals"] = {
  window_days: 30,
  unrated_count: 3,
  items: [
    ["1", "Alta Suciedad", "Andrés Calamaro", 9, 0, null],
    ["2", "Infame", "Babasónicos", 2, 1, null],
    ["3", "A 18' Del Sol", "Luis Alberto Spinetta", 20, 3, null],
    ["4", "Jazz Samba", "Stan Getz / Charlie Byrd", 5, 6, 4],
    ["5", "Clics Modernos", "Charly García", 14, 9, 5],
  ].map(([id, title, artist, days, plays, rating]) => ({
    release_id: String(id),
    title: String(title),
    artist: String(artist),
    thumbnail: null,
    date_added: new Date(Date.parse(FIXTURE_NOW) - Number(days) * 86_400_000).toISOString(),
    play_count: Number(plays),
    album_rating: rating as number | null,
  })),
};

const ago = (days: number) => new Date(Date.parse(FIXTURE_NOW) - days * 86_400_000).toISOString();

/** The Home artboards' PLAYLISTS & SETS: a draft set at a venue, then three playlists. */
export const HOME_PLAYLISTS: HomeResponse["playlists"] = {
  draft_set: {
    id: 11,
    playlist_id: 42,
    title: "Rock Nacional Night",
    location_name: "Club Atlético",
    track_count: 24,
    duration_seconds: 6_312,
    duration_known_share: 1,
  },
  recent: [
    ["Sunday Morning Bossa", 0, 12, 2_895, 1],
    ["Warm-up 112", 3, 18, 4_120, 0.9],
    ["Cumbia Digging", 40, 31, 7_480, 1],
  ].map(([name, days, tracks, seconds, share], i) => ({
    id: i + 1,
    name: String(name),
    created_at: ago(Number(days)),
    track_count: Number(tracks),
    duration_seconds: Number(seconds),
    duration_known_share: Number(share),
  })),
};
