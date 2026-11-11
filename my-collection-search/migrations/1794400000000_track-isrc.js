/**
 * ISRC per track (#1156).
 *
 * The ISRC identifies a recording across catalogs, so it is the one key that
 * can match a track to Qobuz, Tidal, Deezer and so on; our tracks only carry an
 * Apple Music link, which no other service can look up.
 *
 * - `tracks.isrc`: 12 characters, upper case, no hyphens. The CHECK keeps
 *   writers honest so a lookup elsewhere can compare with `=`.
 * - `tracks.isrc_checked_at`: when the Apple Music catalog was last asked. A
 *   track Apple returned no ISRC for is stamped too, so the backfill does no
 *   work on a second run. Cleared with the ISRC when the link changes.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/** @param pgm {import('node-pg-migrate').MigrationBuilder} */
export const up = (pgm) => {
  pgm.addColumns("tracks", {
    isrc: { type: "text", check: "isrc ~ '^[A-Z0-9]{12}$'" },
    isrc_checked_at: { type: "timestamptz" },
  });
  pgm.createIndex("tracks", "isrc", { name: "tracks_isrc_idx", where: "isrc IS NOT NULL" });
};

/** @param pgm {import('node-pg-migrate').MigrationBuilder} */
export const down = (pgm) => {
  pgm.dropIndex("tracks", "isrc", { name: "tracks_isrc_idx" });
  pgm.dropColumns("tracks", ["isrc", "isrc_checked_at"]);
};
