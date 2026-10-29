/**
 * Tracks inherit their album's Discogs `date_added` (#847). The column arrived
 * in 1761512110528 but was never filled, and the import never wrote it. Only
 * nulls are filled; albums an edit had wiped are healed by the next Discogs
 * sync, which also brings their tracks along.
 */
export const up = (pgm) =>
  pgm.sql(`
  UPDATE tracks t
  SET date_added = a.date_added
  FROM albums a
  WHERE t.release_id = a.release_id
    AND t.friend_id = a.friend_id
    AND t.date_added IS NULL
    AND a.date_added IS NOT NULL;
`);

// Data-only: a backfilled value can't be told from one the import wrote.
export const down = () => {};
