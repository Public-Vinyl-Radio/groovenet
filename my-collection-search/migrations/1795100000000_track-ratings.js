/**
 * Per-profile star ratings (#1283, epic #569).
 *
 * A rating belongs to the household profile that gave it, on one collection
 * row: `(track_id, friend_id)` is the `tracks` row, so a record in two
 * libraries keeps a rating on each, exactly as `tracks.star_rating` had them.
 * No row means unrated; 0 is never stored.
 *
 * Backfill: every existing rating is the owner's, including ratings on friend
 * collections. The owner set them all. Other profiles start empty. The owner
 * row is created here if the app has not seeded it yet (`ensureOwner` would
 * at first request); the app later fills in its Discogs username and name.
 *
 * `tracks.star_rating` is kept, unwritten, for one release so an older image
 * still reads the ratings as of this migration. The down migration copies
 * the owner's ratings back into it.
 */
export const up = (pgm) => {
  pgm.sql(`
    INSERT INTO users (name, is_owner) VALUES ('Owner', true)
    ON CONFLICT (is_owner) WHERE is_owner DO NOTHING;

    CREATE TABLE track_ratings (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      track_id varchar(255) NOT NULL,
      friend_id integer NOT NULL,
      rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, track_id, friend_id),
      FOREIGN KEY (track_id, friend_id) REFERENCES tracks(track_id, friend_id)
        ON UPDATE CASCADE ON DELETE CASCADE
    );
    CREATE INDEX track_ratings_track ON track_ratings (track_id, friend_id);

    INSERT INTO track_ratings (user_id, track_id, friend_id, rating)
    SELECT u.id, t.track_id, t.friend_id, LEAST(t.star_rating, 5)
    FROM tracks t
    CROSS JOIN (SELECT id FROM users WHERE is_owner) u
    WHERE t.star_rating > 0;

    COMMENT ON COLUMN tracks.star_rating IS
      'Deprecated (#1283): ratings live in track_ratings, per profile. Not written since; kept for one release, then dropped.';
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    WITH owner_ratings AS (
      SELECT t.track_id, t.friend_id, COALESCE(r.rating, 0) AS rating
      FROM tracks t
      LEFT JOIN track_ratings r
        ON r.track_id = t.track_id AND r.friend_id = t.friend_id
        AND r.user_id = (SELECT id FROM users WHERE is_owner)
    )
    UPDATE tracks t SET star_rating = o.rating
    FROM owner_ratings o
    WHERE o.track_id = t.track_id AND o.friend_id = t.friend_id
      AND t.star_rating IS DISTINCT FROM o.rating;
    COMMENT ON COLUMN tracks.star_rating IS NULL;
  `);
  pgm.dropTable("track_ratings");
};
