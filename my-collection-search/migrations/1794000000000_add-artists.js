/** Artists are shared; ownership stays with each credited album or track (#703). */
export const up = (pgm) => {
  // Keep the existing composite album key for all current consumers.
  pgm.addColumn("albums", { id: { type: "serial", notNull: true, unique: true } });
  pgm.createTable("artists", {
    id: "id",
    name: { type: "text", notNull: true },
    sort_name: { type: "text", notNull: true },
    slug: { type: "text", notNull: true, unique: true },
    discogs_artist_id: { type: "bigint", unique: true },
    apple_artist_id: { type: "text", unique: true },
    is_placeholder: { type: "boolean", notNull: true, default: false },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.createTable("artist_aliases", {
    alias: { type: "text", notNull: true },
    alias_normalized: { type: "text", primaryKey: true, check: "alias_normalized <> ''" },
    artist_id: { type: "integer", notNull: true, references: "artists", onDelete: "CASCADE" },
  });
  pgm.createIndex("artist_aliases", "artist_id");

  for (const table of ["album_artists", "track_artists"]) {
    pgm.createTable(table, {
      ...(table === "album_artists"
        ? {
            album_id: {
              type: "integer",
              notNull: true,
              references: "albums(id)",
              onDelete: "CASCADE",
            },
          }
        : {
            track_id: { type: "varchar(255)", notNull: true },
            friend_id: { type: "integer", notNull: true },
          }),
      artist_id: { type: "integer", notNull: true, references: "artists", onDelete: "RESTRICT" },
      role: {
        type: "text",
        notNull: true,
        check: "role IN ('primary', 'featured', 'remixer', 'composer')",
      },
      position: { type: "integer", notNull: true, check: "position >= 0" },
      credited_as: { type: "text", notNull: true },
      source: {
        type: "text",
        notNull: true,
        check: "source IN ('discogs', 'apple', 'legacy', 'manual')",
      },
    });
    pgm.addConstraint(table, `${table}_pkey`, {
      primaryKey: [
        ...(table === "album_artists" ? ["album_id"] : ["track_id", "friend_id"]),
        "artist_id",
        "role",
      ],
    });
    pgm.createIndex(table, "artist_id");
  }
  pgm.addConstraint("track_artists", "track_artists_track_fk", {
    foreignKeys: {
      columns: ["track_id", "friend_id"],
      references: "tracks(track_id, friend_id)",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
  });
};

export const down = (pgm) => {
  pgm.dropTable("track_artists");
  pgm.dropTable("album_artists");
  pgm.dropTable("artist_aliases");
  pgm.dropTable("artists");
  pgm.dropColumn("albums", "id");
};
