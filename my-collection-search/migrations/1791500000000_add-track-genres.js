/**
 * Track-level DJ genres as links to the canonical taxonomy (#371), plus free
 * text descriptors for mood and description words that are not genres.
 *
 * `local_tags` is deliberately left untouched: it stays the raw original for
 * audit and undo while reconciliation (#372) proposes links from it.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.createTable("track_genres", {
    track_id: { type: "varchar(255)", notNull: true },
    friend_id: { type: "integer", notNull: true },
    genre_id: {
      type: "uuid",
      notNull: true,
      // RESTRICT, not CASCADE: deleting a linked genre must go through merge,
      // which moves the links, rather than silently untagging tracks.
      references: "genres(id)",
      onDelete: "RESTRICT",
    },
    source: { type: "varchar(20)", notNull: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });
  pgm.addConstraint("track_genres", "track_genres_pkey", {
    primaryKey: ["track_id", "friend_id", "genre_id"],
  });
  pgm.addConstraint("track_genres", "track_genres_track_fk", {
    foreignKeys: {
      columns: ["track_id", "friend_id"],
      references: "tracks(track_id, friend_id)",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
  });
  pgm.addConstraint("track_genres", "track_genres_source_check", {
    check: "source IN ('manual', 'enrichment', 'reconciliation')",
  });
  // Genre pages, counts and filtering (#375) look tracks up by genre.
  pgm.createIndex("track_genres", "genre_id", { name: "idx_track_genres_genre_id" });

  pgm.addColumn("tracks", {
    descriptors: {
      type: "text[]",
      notNull: true,
      default: pgm.func("'{}'::text[]"),
    },
  });
};

export const down = (pgm) => {
  pgm.dropColumn("tracks", "descriptors");
  pgm.dropTable("track_genres");
};
