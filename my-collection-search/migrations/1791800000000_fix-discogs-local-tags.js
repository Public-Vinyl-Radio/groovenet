/**
 * Earlier Discogs imports passed arrays to the text local_tags column. pg
 * stored empty arrays as '{}' and non-empty arrays as Postgres array literals.
 * Remove stale text embeddings for corrected tracks so the periodic missing-
 * embedding sweep regenerates identity and context from the cleaned tags.
 */
export const shorthands = undefined;

export const up = (pgm) => {
  pgm.sql(`
    DELETE FROM track_embeddings te
    USING tracks t
    WHERE te.track_id = t.track_id
      AND te.friend_id = t.friend_id
      AND te.embedding_type IN ('identity', 'context')
      AND btrim(t.local_tags) LIKE '{%}';

    UPDATE tracks
    SET local_tags = CASE
      WHEN btrim(local_tags) = '{}' THEN NULL
      ELSE array_to_string(btrim(local_tags)::text[], ', ')
    END
    WHERE btrim(local_tags) LIKE '{%}';
  `);
};

// This is a data correction; the original array-literal formatting is not restored.
export const down = () => {};
