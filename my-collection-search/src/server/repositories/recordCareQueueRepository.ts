import { dbQuery } from "@/lib/serverDb";
import { CARE_SCOPE_SQL } from "./recordCopyRepository";
import { newArrivalsPredicate } from "./homeRepository";
import type { RecordCareQueueItem } from "@groovenet/contracts";

export type QueueRow = RecordCareQueueItem & {
  group_name: "spun_recently" | "new_arrivals" | "backlog";
  spin_count: number;
  last_spin_at: string | null;
};
export type QueueData = { items: QueueRow[]; backlog_total: number };
export type CleaningHistory = {
  total: number;
  cleaned: number;
  recent: number;
  cleaning_days: number;
  first_recent: Date | string | null;
};

// Keep exactly the care views' scope, including albums with no live copy row.
const scope = `WITH scope AS (${CARE_SCOPE_SQL}), copies AS (
  SELECT scope.*, a.date_added,
    (SELECT min(ra.occurred_at) FROM record_actions ra
     WHERE ra.copy_id = scope.copy_id AND ra.action_type = 'cleaned' AND ra.voided_at IS NULL) AS first_cleaned
  FROM scope JOIN albums a ON a.friend_id = scope.friend_id AND a.release_id = scope.release_id
)`;
export const recordCareQueueSql = `${scope}, spins AS (
  SELECT e.release_id, count(*)::int AS spin_count, max(e.played_at) AS last_spin_at
  FROM track_spin_events e JOIN spin_sessions s ON s.id = e.session_id AND s.medium = 'vinyl'
  WHERE e.friend_id = $1
    AND e.played_at >= ($2::date::timestamp AT TIME ZONE $3)
    AND e.played_at < (($2::date + interval '1 month') AT TIME ZONE $3)
  GROUP BY e.release_id
), grouped AS (
  SELECT c.copy_id, c.release_id, c.album_title AS title, c.album_artist AS artist,
    c.album_thumbnail AS thumbnail, c.inner_sleeve_type,
    c.date_added AT TIME ZONE 'UTC' AS added_at,
    coalesce(s.spin_count, 0) AS spin_count, s.last_spin_at,
    CASE WHEN s.spin_count > 0 THEN 'spun_recently'
      WHEN ${newArrivalsPredicate("c", "$4")} THEN 'new_arrivals'
      ELSE 'backlog' END AS group_name
  FROM copies c LEFT JOIN spins s ON s.release_id = c.release_id
  WHERE c.first_cleaned IS NULL
    AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset($7::jsonb) AS excluded(copy_id int, release_id text)
      WHERE excluded.release_id = c.release_id AND excluded.copy_id IS NOT DISTINCT FROM c.copy_id)
), ranked AS (
  SELECT *, row_number() OVER (PARTITION BY group_name ORDER BY
    CASE WHEN group_name = 'spun_recently' THEN spin_count END DESC,
    CASE WHEN group_name = 'spun_recently' THEN last_spin_at END DESC,
    CASE WHEN group_name = 'new_arrivals' THEN added_at END DESC,
    artist ASC, title ASC, release_id ASC, copy_id ASC NULLS FIRST) AS position
  FROM grouped
)
SELECT coalesce(jsonb_agg(r ORDER BY CASE group_name WHEN 'spun_recently' THEN 1 WHEN 'new_arrivals' THEN 2 ELSE 3 END, position)
  FILTER (WHERE group_name <> 'backlog' OR (position > $6 AND ($5::int IS NULL OR position <= $6 + $5))), '[]'::jsonb) AS items,
  count(*) FILTER (WHERE group_name = 'backlog')::int AS backlog_total FROM ranked r`;

export const cleaningHistorySql = `${scope}
SELECT count(*)::int AS total, count(first_cleaned)::int AS cleaned,
 count(*) FILTER (WHERE first_cleaned >= $2::timestamptz - interval '28 days' AND first_cleaned <= $2)::int AS recent,
 count(DISTINCT (first_cleaned AT TIME ZONE $3)::date) FILTER (WHERE first_cleaned >= $2::timestamptz - interval '28 days' AND first_cleaned <= $2)::int AS cleaning_days,
 min(first_cleaned) FILTER (WHERE first_cleaned >= $2::timestamptz - interval '28 days' AND first_cleaned <= $2) AS first_recent
FROM copies`;

export const recordCareQueueRepository = {
  async queue(
    friendId: number,
    month: string,
    zone: string,
    now: Date,
    limit: number | null,
    offset: number,
    excluded: Array<{ copy_id: number | null; release_id: string }>,
  ): Promise<QueueData> {
    return (
      await dbQuery<QueueData>(recordCareQueueSql, [
        friendId,
        `${month}-01`,
        zone,
        now,
        limit,
        offset,
        JSON.stringify(excluded),
      ])
    ).rows[0];
  },
  async history(friendId: number, now: Date, zone: string): Promise<CleaningHistory> {
    return (await dbQuery<CleaningHistory>(cleaningHistorySql, [friendId, now, zone])).rows[0];
  },
};
