/**
 * Drop the deprecated `tracks.star_rating` (#1302).
 *
 * Ratings moved to `track_ratings` in #1283 and the column has been unwritten
 * since; the release that shipped that is deployed, so nothing reads it.
 *
 * The down re-adds the column and copies the owner's current ratings back into
 * it (0 when unrated), as the down of `track-ratings` does.
 */
export const up = (pgm) => {
  pgm.sql(`ALTER TABLE tracks DROP COLUMN star_rating;`);
};

export const down = (pgm) => {
  pgm.sql(`
    ALTER TABLE tracks ADD COLUMN star_rating integer DEFAULT 0;
    COMMENT ON COLUMN tracks.star_rating IS
      'Deprecated (#1283): ratings live in track_ratings, per profile. Not written since.';

    UPDATE tracks t SET star_rating = r.rating
    FROM track_ratings r
    WHERE r.track_id = t.track_id AND r.friend_id = t.friend_id
      AND r.user_id = (SELECT id FROM users WHERE is_owner);
  `);
};
