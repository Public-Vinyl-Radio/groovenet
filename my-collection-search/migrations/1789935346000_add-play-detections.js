/**
 * Raw, per-window matcher output. This deliberately remains separate from the
 * curated spin history: a matcher can produce several candidates for one
 * window, including a window with no candidate at all.
 */
export const up = (pgm) => {
  pgm.createTable("play_detections", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    ingest_id: {
      type: "uuid",
      notNull: true,
      references: "audio_ingests(id)",
      onDelete: "CASCADE",
    },
    source_id: { type: "varchar(255)", notNull: true },
    session_id: { type: "varchar(255)" },
    // null records a no-match window; do not omit those rows.
    track_id: { type: "varchar(255)" },
    friend_id: {
      type: "integer",
      references: "friends(id)",
      onDelete: "SET NULL",
    },
    confidence: { type: "real" },
    offset_seconds: { type: "real" },
    window_start_at: { type: "timestamptz" },
    fingerprint_type: { type: "varchar(50)" },
    fingerprint_version: { type: "varchar(50)" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  // #279 reads a recent window for one listener source.
  pgm.createIndex("play_detections", ["source_id", "window_start_at"], {
    name: "idx_play_detections_source_window_start",
  });
  pgm.createIndex("play_detections", ["track_id", "friend_id", "window_start_at"], {
    name: "idx_play_detections_track_friend_window_start",
  });
};

export const down = (pgm) => {
  pgm.dropTable("play_detections");
};
