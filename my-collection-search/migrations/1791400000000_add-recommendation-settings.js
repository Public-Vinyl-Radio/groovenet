/**
 * Per-library scope for track suggestions: related tracks, similar tracks and
 * playlist recommendations. `library` keeps candidates to the library being
 * viewed; `all` searches every library. A library with no row is `library`.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.createTable("recommendation_settings", {
    friend_id: {
      type: "integer",
      notNull: true,
      primaryKey: true,
      references: "friends(id)",
      onDelete: "CASCADE",
    },
    scope: {
      type: "varchar(10)",
      notNull: true,
      default: "library",
      check: "scope IN ('library', 'all')",
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropTable("recommendation_settings");
};
