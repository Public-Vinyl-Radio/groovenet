import type { PoolClient } from "pg";
import { dbQuery } from "@/lib/serverDb";
import type { TrackOtherRating } from "@groovenet/contracts";

/**
 * Per-profile star ratings (#1283). A rating is one household profile's, on
 * one collection row `(track_id, friend_id)`; no row is unrated. Everything
 * that reads, filters or ranks by rating goes through the viewer's rows here,
 * never `tracks.star_rating`, which is deprecated and no longer written.
 */
export type TrackRatingRef = { track_id: string; friend_id: number };

export type ViewerRatings = {
  /** The viewer's rating, 0 when unrated (what `tracks.star_rating` held for an unrated row). */
  rating: number;
  /** Every other profile's rating on the row, by profile display name. */
  others: TrackOtherRating[];
};

export const ratingKey = (trackId: string, friendId: number) => `${friendId}:${trackId}`;

type RatingRow = TrackRatingRef & { user_id: string; name: string; rating: number };

export class TrackRatingRepository {
  /** Ratings of `refs`, split into the viewer's and everyone else's. One query. */
  async forTracks(refs: TrackRatingRef[], viewerId: string): Promise<Map<string, ViewerRatings>> {
    const out = new Map<string, ViewerRatings>();
    if (refs.length === 0) return out;
    const { rows } = await dbQuery<RatingRow>(
      `SELECT r.track_id, r.friend_id, r.user_id, u.name, r.rating
       FROM unnest($1::text[], $2::integer[]) AS k(track_id, friend_id)
       JOIN track_ratings r ON r.track_id = k.track_id AND r.friend_id = k.friend_id
       JOIN users u ON u.id = r.user_id
       ORDER BY u.is_owner DESC, u.created_at, u.id`,
      [refs.map((r) => r.track_id), refs.map((r) => r.friend_id)],
    );
    for (const row of rows) {
      const key = ratingKey(row.track_id, row.friend_id);
      const entry = out.get(key) ?? { rating: 0, others: [] };
      if (row.user_id === viewerId) entry.rating = row.rating;
      else entry.others.push({ user_id: row.user_id, name: row.name, rating: row.rating });
      out.set(key, entry);
    }
    return out;
  }

  /** Sets the viewer's rating; 0 (or null) clears it. */
  async set(
    userId: string,
    ref: TrackRatingRef,
    rating: number | null,
    db?: Pick<PoolClient, "query">,
  ): Promise<void> {
    const run = (sql: string, params: unknown[]) =>
      db ? db.query(sql, params) : dbQuery(sql, params);
    if (!rating || rating <= 0) {
      await run(
        "DELETE FROM track_ratings WHERE user_id = $1 AND track_id = $2 AND friend_id = $3",
        [userId, ref.track_id, ref.friend_id],
      );
      return;
    }
    await run(
      `INSERT INTO track_ratings (user_id, track_id, friend_id, rating) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, track_id, friend_id)
       DO UPDATE SET rating = EXCLUDED.rating, updated_at = now()`,
      [userId, ref.track_id, ref.friend_id, Math.min(5, Math.round(rating))],
    );
  }
}

export const trackRatingRepository = new TrackRatingRepository();
