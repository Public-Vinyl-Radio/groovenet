import { chooseArtistSlug } from "../src/lib/artists/slug.js";

/**
 * Readable artist slugs (#1079). The slug used to be a hash that doubled as
 * the identity key; that role moves to `identity_key`, and the slug becomes a
 * name that can change. Every previous slug keeps resolving through
 * `artist_slug_history`.
 */
export const up = async (pgm) => {
  pgm.addColumn("artists", { identity_key: { type: "text", unique: true } });
  pgm.sql("UPDATE artists SET identity_key = slug");
  pgm.createTable("artist_slug_history", {
    slug: { type: "text", primaryKey: true },
    artist_id: { type: "integer", notNull: true, references: "artists", onDelete: "CASCADE" },
  });
  pgm.createIndex("artist_slug_history", "artist_id");

  // Live artists first, so a merged duplicate never takes the plain name.
  const { rows } = await pgm.db.query(
    `SELECT id, name, slug, discogs_artist_id::text AS discogs_artist_id FROM artists
     ORDER BY (merged_into IS NOT NULL), id`,
  );
  const taken = new Set();
  for (const artist of rows) {
    const slug = await chooseArtistSlug(artist.name, artist.discogs_artist_id, (s) => taken.has(s));
    taken.add(slug);
    pgm.sql(
      `INSERT INTO artist_slug_history (slug, artist_id) VALUES ('${artist.slug.replaceAll("'", "''")}', ${Number(artist.id)})`,
    );
    pgm.sql(
      `UPDATE artists SET slug = '${slug.replaceAll("'", "''")}' WHERE id = ${Number(artist.id)}`,
    );
  }
};

export const down = (pgm) => {
  pgm.sql("UPDATE artists SET slug = identity_key WHERE identity_key IS NOT NULL");
  pgm.dropTable("artist_slug_history");
  pgm.dropColumn("artists", "identity_key");
};
