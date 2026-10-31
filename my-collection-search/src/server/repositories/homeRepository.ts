import type { HomeResponse } from "@groovenet/contracts";
import { dbQuery } from "@/lib/serverDb";

type Arrival = HomeResponse["new_arrivals"]["items"][number];
type Recent = HomeResponse["playlists"]["recent"][number];
export type ArrivalRow = Omit<Arrival, "date_added"> & { date_added: Date | string };
export type RecentRow = Omit<Recent, "created_at"> & { created_at: Date | string };

export const homeArrivalsSql = `WITH arrivals AS MATERIALIZED (
  SELECT release_id, title, artist, album_thumbnail AS thumbnail, date_added, album_rating
  FROM albums WHERE friend_id = $1
    AND date_added >= ($2::timestamptz AT TIME ZONE 'UTC') - interval '30 days'
    AND date_added <= ($2::timestamptz AT TIME ZONE 'UTC')
), ranked AS (
  SELECT a.release_id, a.title, a.artist, a.thumbnail, a.date_added AT TIME ZONE 'UTC' AS date_added, a.album_rating, (
    (SELECT count(*) FROM track_spin_events e WHERE e.friend_id = $1 AND e.release_id = a.release_id)
    + (SELECT count(*) FROM spin_sessions s WHERE s.friend_id = $1 AND s.release_id = a.release_id
       AND NOT EXISTS (SELECT 1 FROM track_spin_events e WHERE e.session_id = s.id))
  )::int AS play_count FROM arrivals a
)
SELECT (SELECT count(*)::int FROM arrivals WHERE album_rating IS NULL) AS unrated_count,
  COALESCE((SELECT jsonb_agg(r ORDER BY play_count, date_added DESC, release_id)
    FROM (SELECT * FROM ranked ORDER BY play_count, date_added DESC, release_id LIMIT 5) r), '[]'::jsonb) AS items`;

export const homeAttentionSql = `SELECT
  (SELECT count(*)::int FROM tracks WHERE friend_id = $1
    AND (local_audio_url IS NULL OR local_audio_url = '')) AS missing_audio,
  (SELECT count(*)::int FROM tracks WHERE friend_id = $1
    AND (bpm IS NULL OR key IS NULL)) AS missing_bpm_or_key`;

// Playlists currently have no owner column; membership is the available friend scope.
const member = `EXISTS (SELECT 1 FROM playlist_tracks own WHERE own.playlist_id = p.id AND own.friend_id = $1)`;
const totals = `SELECT count(*)::int AS track_count,
  COALESCE(sum(t.duration_seconds), 0)::float8 AS duration_seconds,
  COALESCE(count(t.duration_seconds)::float8 / NULLIF(count(*), 0), 0) AS duration_known_share
  FROM playlist_tracks pt LEFT JOIN tracks t ON t.track_id = pt.track_id AND t.friend_id = pt.friend_id
  WHERE pt.playlist_id = picked.playlist_id`;
export const homePlaylistsSql = `WITH draft AS (
  SELECT s.id, s.playlist_id, s.title, s.location_name FROM live_sets s
  JOIN playlists p ON p.id = s.playlist_id WHERE s.status = 'draft' AND ${member}
  ORDER BY s.updated_at DESC, s.id DESC LIMIT 1
), recent AS (
  SELECT p.id, p.id AS playlist_id, p.name, p.created_at AT TIME ZONE 'UTC' AS created_at FROM playlists p
  WHERE ${member} ORDER BY p.created_at DESC, p.id DESC LIMIT 3
)
SELECT (SELECT to_jsonb(d) FROM (
  SELECT picked.*, stats.* FROM draft picked CROSS JOIN LATERAL (${totals}) stats
) d) AS draft_set,
COALESCE((SELECT jsonb_agg(r ORDER BY created_at DESC, id DESC) FROM (
  SELECT picked.id, picked.name, picked.created_at, stats.* FROM recent picked
  CROSS JOIN LATERAL (${totals}) stats
) r), '[]'::jsonb) AS recent`;
export const homeCountsSql = `SELECT
  (SELECT count(*)::int FROM tracks WHERE friend_id = $1) AS tracks,
  (SELECT count(*)::int FROM albums WHERE friend_id = $1) AS albums,
  (SELECT count(*)::int FROM playlists p WHERE ${member}) AS playlists`;

export const homeRepository = {
  async counts(friendId: number) {
    return (await dbQuery<HomeResponse["counts"]>(homeCountsSql, [friendId])).rows[0];
  },
  async arrivals(friendId: number, now: Date) {
    return (
      await dbQuery<{ unrated_count: number; items: ArrivalRow[] }>(homeArrivalsSql, [
        friendId,
        now,
      ])
    ).rows[0];
  },
  async attention(friendId: number) {
    return (
      await dbQuery<Pick<HomeResponse["attention"], "missing_audio" | "missing_bpm_or_key">>(
        homeAttentionSql,
        [friendId],
      )
    ).rows[0];
  },
  async playlists(friendId: number) {
    return (
      await dbQuery<{ draft_set: HomeResponse["playlists"]["draft_set"]; recent: RecentRow[] }>(
        homePlaylistsSql,
        [friendId],
      )
    ).rows[0];
  },
};
