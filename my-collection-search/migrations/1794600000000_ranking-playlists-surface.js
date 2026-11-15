/**
 * Ranking profiles order playlists too (#1193): the surface `playlists`.
 *
 * Widens the two surface CHECKs from 1794500000000_add-ranking-profiles and
 * the bound on how many surfaces a profile lists. Postgres named those inline
 * column checks `<table>_<column>_check`; they are replaced by named ones.
 *
 * Down removes `playlists` again: its selections are deleted, it is dropped
 * from every profile's surfaces, and a profile left with none gets the three
 * it could have had before.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

const list = (surfaces) => surfaces.map((s) => `'${s}'`).join(", ");
const BEFORE = ["suggestions", "related", "recommendations"];
const AFTER = [...BEFORE, "playlists"];

const surfacesCheck = (surfaces) =>
  `cardinality(surfaces) BETWEEN 1 AND ${surfaces.length} AND surfaces <@ ARRAY[${list(surfaces)}]::text[]`;
const surfaceCheck = (surfaces) => `surface IN (${list(surfaces)})`;

/** @param pgm {import('node-pg-migrate').MigrationBuilder} */
export const up = (pgm) => {
  pgm.dropConstraint("ranking_profiles", "ranking_profiles_surfaces_check");
  pgm.addConstraint("ranking_profiles", "ranking_profiles_surfaces_check", {
    check: surfacesCheck(AFTER),
  });
  pgm.dropConstraint("ranking_profile_selections", "ranking_profile_selections_surface_check");
  pgm.addConstraint("ranking_profile_selections", "ranking_profile_selections_surface_check", {
    check: surfaceCheck(AFTER),
  });
};

/** @param pgm {import('node-pg-migrate').MigrationBuilder} */
export const down = (pgm) => {
  pgm.sql("DELETE FROM ranking_profile_selections WHERE surface = 'playlists'");
  pgm.sql(`
    UPDATE ranking_profiles
    SET surfaces = CASE
      WHEN cardinality(array_remove(surfaces, 'playlists')) = 0 THEN ARRAY[${list(BEFORE)}]::text[]
      ELSE array_remove(surfaces, 'playlists')
    END
    WHERE 'playlists' = ANY(surfaces)
  `);
  pgm.dropConstraint("ranking_profile_selections", "ranking_profile_selections_surface_check");
  pgm.addConstraint("ranking_profile_selections", "ranking_profile_selections_surface_check", {
    check: surfaceCheck(BEFORE),
  });
  pgm.dropConstraint("ranking_profiles", "ranking_profiles_surfaces_check");
  pgm.addConstraint("ranking_profiles", "ranking_profiles_surfaces_check", {
    check: surfacesCheck(BEFORE),
  });
};
