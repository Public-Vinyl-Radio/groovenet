/**
 * `genre_normalize(text)`: the taxonomy lookup key computed in SQL, so the
 * genre filter (#375) can match an album's raw Discogs genres and styles
 * against taxonomy names and aliases without a stored copy of every spelling.
 *
 * It mirrors src/lib/genres/normalization.ts — NFKC, the U+2010–U+2015 dashes
 * folded to "-", whitespace collapsed, trimmed, lower-cased. Keep both in
 * sync: a spelling must produce the same key in TypeScript and in Postgres.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.sql(String.raw`
    CREATE FUNCTION genre_normalize(value text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    AS $$
      SELECT lower(btrim(regexp_replace(
        regexp_replace(normalize(value, NFKC), '[‐-―]', '-', 'g'),
        '\s+', ' ', 'g'
      )))
    $$;
  `);
};

export const down = (pgm) => {
  pgm.sql("DROP FUNCTION genre_normalize(text);");
};
