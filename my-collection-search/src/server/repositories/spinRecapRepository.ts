import { dbQuery } from "@/lib/serverDb";

export type RecapGroup = {
  current: boolean;
  release_id: string;
  track_id: string;
  title: string;
  artist: string;
  album: string;
  record_artist: string;
  thumbnail: string | null;
  medium: "vinyl" | "digital";
  week: number;
  weekday: number;
  block: number;
  duration: number | null;
  bpm: number | null;
  genres: { genre_id: string; name: string }[];
  spins: number;
};

// Keep predicates on the raw timestamptz column so the friend/time index can
// bound the scan. Calendar arithmetic happens on local timestamps before conversion.
export const recapBoundsSql = `WITH bounds AS (
  SELECT $2::date::timestamp AT TIME ZONE $3 AS start,
    ($2::date + interval '1 month') AT TIME ZONE $3 AS finish,
    ($2::date - interval '1 month') AT TIME ZONE $3 AS previous
)`;

export const recapGroupsSql = `${recapBoundsSql},
  month_events AS MATERIALIZED (
    SELECT e.* FROM track_spin_events e CROSS JOIN bounds b
    WHERE e.friend_id = $1 AND e.played_at >= b.previous AND e.played_at < b.finish
  ),
  roots AS (
    WITH RECURSIVE tree AS (
      SELECT id, id AS root_id, name FROM genres WHERE parent_id IS NULL
      UNION ALL
      SELECT g.id, tree.root_id, tree.name FROM genres g JOIN tree ON g.parent_id = tree.id
    ) SELECT * FROM tree
  ), tagged AS (
    SELECT tg.track_id, tg.friend_id,
      jsonb_agg(DISTINCT jsonb_build_object('genre_id', r.root_id, 'name', r.name)) AS genres
    FROM track_genres tg JOIN roots r ON r.id = tg.genre_id
    WHERE tg.friend_id = $1 AND tg.track_id IN (SELECT track_id FROM month_events) GROUP BY tg.track_id, tg.friend_id
  )
  SELECT e.played_at >= b.start AS current, e.release_id, e.track_id,
    COALESCE(t.title, e.title_snapshot) AS title,
    COALESCE(t.artist, e.artist_snapshot) AS artist,
    COALESCE(a.title, e.album_snapshot) AS album,
    COALESCE(a.artist, t.artist, e.artist_snapshot) AS record_artist,
    COALESCE(a.album_thumbnail, t.album_thumbnail) AS thumbnail,
    s.medium,
    (extract(day FROM e.played_at AT TIME ZONE $3)::int - 1) / 7 + 1 AS week,
    extract(isodow FROM e.played_at AT TIME ZONE $3)::int - 1 AS weekday,
    extract(hour FROM e.played_at AT TIME ZONE $3)::int / 2 AS block,
    t.duration_seconds AS duration, t.bpm,
    COALESCE(tagged.genres, '[]'::jsonb) AS genres, count(*)::int AS spins
  FROM month_events e CROSS JOIN bounds b
  JOIN spin_sessions s ON s.id = e.session_id
  LEFT JOIN tracks t ON t.track_id = e.track_id AND t.friend_id = e.friend_id
  LEFT JOIN albums a ON a.release_id = e.release_id AND a.friend_id = e.friend_id
  LEFT JOIN tagged ON tagged.track_id = e.track_id AND tagged.friend_id = e.friend_id
  GROUP BY 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15
  ORDER BY 2,3,4,5,6,7`;

export const recapFirstSpinsSql = `${recapBoundsSql}, candidates AS (
  SELECT DISTINCT e.release_id FROM track_spin_events e CROSS JOIN bounds b
  WHERE e.friend_id = $1 AND e.played_at >= b.previous AND e.played_at < b.finish
), firsts AS (
  SELECT (SELECT e.played_at FROM track_spin_events e
    WHERE e.friend_id = $1 AND e.release_id = c.release_id
    ORDER BY e.played_at LIMIT 1) AS first_at FROM candidates c
)
SELECT count(*) FILTER (WHERE first_at >= b.start)::int AS current,
  count(*) FILTER (WHERE first_at >= b.previous AND first_at < b.start)::int AS previous
FROM firsts CROSS JOIN bounds b`;

export const spinRecapRepository = {
  async groups(friendId: number, month: string, zone: string): Promise<RecapGroup[]> {
    const { rows } = await dbQuery<RecapGroup>(recapGroupsSql, [friendId, `${month}-01`, zone]);
    return rows;
  },
  async firstSpins(friendId: number, month: string, zone: string) {
    const { rows } = await dbQuery<{ current: number; previous: number }>(recapFirstSpinsSql, [
      friendId,
      `${month}-01`,
      zone,
    ]);
    return rows[0];
  },
};
