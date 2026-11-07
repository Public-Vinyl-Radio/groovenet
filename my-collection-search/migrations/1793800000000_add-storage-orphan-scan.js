/**
 * The last orphan scan of the audio volume (#1052).
 *
 * One row, id always 1: the page shows the latest result without rescanning,
 * so only the latest is kept. `files` and `tracks` hold the full lists as
 * JSON; they are paged on read. A failed scan sets `error` and leaves the
 * previous result in place.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.createTable("storage_orphan_scan", {
    id: { type: "smallint", primaryKey: true, default: 1, check: "id = 1" },
    scanned_at: { type: "timestamptz" },
    duration_ms: { type: "integer" },
    files: { type: "jsonb", notNull: true, default: "[]" },
    tracks: { type: "jsonb", notNull: true, default: "[]" },
    error: { type: "text" },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropTable("storage_orphan_scan");
};
