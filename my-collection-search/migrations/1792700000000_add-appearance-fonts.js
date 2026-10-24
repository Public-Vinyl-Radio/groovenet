/**
 * The app-wide font choice per role, next to the palette. Null means the app's
 * own default for that role. Ids are checked in code against the font
 * registry, not here, so a new face needs no migration.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.addColumns("appearance_settings", {
    font_display: { type: "varchar(64)" },
    font_body: { type: "varchar(64)" },
    font_label: { type: "varchar(64)" },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropColumns("appearance_settings", ["font_display", "font_body", "font_label"]);
};
