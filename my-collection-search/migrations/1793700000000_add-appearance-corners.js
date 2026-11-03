/**
 * The app-wide corner style, next to the palette and fonts. `square` is the
 * house style; `rounded` softens buttons, inputs, cards and the like.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.addColumns("appearance_settings", {
    corners: {
      type: "varchar(16)",
      notNull: true,
      default: "square",
      check: "corners IN ('square', 'rounded')",
    },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropColumns("appearance_settings", ["corners"]);
};
