/**
 * Optional context around a playlist when it becomes a planned or performed set.
 * Keeping this separate means ordinary playlists retain their small, stable shape.
 */
export const up = (pgm) => {
  pgm.createTable("live_sets", {
    id: { type: "serial", primaryKey: true },
    playlist_id: {
      type: "integer",
      notNull: true,
      unique: true,
      references: "playlists(id)",
      onDelete: "CASCADE",
    },
    title: { type: "varchar(255)" },
    status: { type: "varchar(20)", notNull: true, default: "draft" },
    notes: { type: "text" },
    location_name: { type: "varchar(255)" },
    location_city: { type: "varchar(255)" },
    cover_image_url: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.addConstraint("live_sets", "live_sets_status_check", {
    check: "status IN ('draft', 'performed', 'archived')",
  });

  pgm.createTable("live_set_collaborators", {
    id: { type: "serial", primaryKey: true },
    live_set_id: { type: "integer", notNull: true, references: "live_sets(id)", onDelete: "CASCADE" },
    friend_id: { type: "integer", notNull: true, references: "friends(id)", onDelete: "CASCADE" },
    role: { type: "varchar(40)", notNull: true, default: "collaborator" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.createConstraint("live_set_collaborators", "live_set_collaborators_unique", {
    unique: ["live_set_id", "friend_id"],
  });

  pgm.createTable("live_set_performances", {
    id: { type: "serial", primaryKey: true },
    live_set_id: { type: "integer", notNull: true, references: "live_sets(id)", onDelete: "CASCADE" },
    performed_at: { type: "timestamptz", notNull: true },
    venue_name: { type: "varchar(255)" },
    location_city: { type: "varchar(255)" },
    notes: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.createIndex("live_set_performances", ["live_set_id", "performed_at"], {
    name: "idx_live_set_performances_set_date",
  });

  pgm.createTable("live_set_media", {
    id: { type: "serial", primaryKey: true },
    live_set_id: { type: "integer", notNull: true, references: "live_sets(id)", onDelete: "CASCADE" },
    media_type: { type: "varchar(20)", notNull: true },
    url: { type: "text", notNull: true },
    filename: { type: "varchar(255)" },
    caption: { type: "text" },
    position: { type: "integer", notNull: true, default: 0 },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.addConstraint("live_set_media", "live_set_media_type_check", {
    check: "media_type IN ('image', 'flyer', 'audio', 'youtube', 'link')",
  });
  pgm.createIndex("live_set_media", ["live_set_id", "position"], {
    name: "idx_live_set_media_set_position",
  });
};

export const down = (pgm) => {
  pgm.dropTable("live_set_media");
  pgm.dropTable("live_set_performances");
  pgm.dropTable("live_set_collaborators");
  pgm.dropTable("live_sets");
};
