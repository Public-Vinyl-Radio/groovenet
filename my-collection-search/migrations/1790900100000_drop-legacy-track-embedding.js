/**
 * Drops the legacy free-text "prompt" embedding (#393). `tracks.embedding` was
 * a fixed vector(1536) with no model/dims, and ga-service — its last reader —
 * now takes `audio_vibe` vectors from `track_embeddings`. The per-friend prompt
 * template table only existed to feed it.
 *
 * Down recreates the shapes, not the data: the embeddings regenerate from track
 * fields, and the templates were user-edited text that can't be rebuilt.
 */
export const up = (pgm) => {
  pgm.dropTable("embedding_prompt_settings");
  pgm.dropColumn("tracks", "embedding");
};

export const down = (pgm) => {
  pgm.addColumn("tracks", {
    embedding: { type: "vector(1536)", notNull: false },
  });
  pgm.createTable("embedding_prompt_settings", {
    friend_id: {
      type: "integer",
      notNull: true,
      references: "friends(id)",
      onDelete: "CASCADE",
    },
    prompt_template: { type: "text", notNull: true },
    updated_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });
  pgm.addConstraint(
    "embedding_prompt_settings",
    "embedding_prompt_settings_pk",
    { primaryKey: ["friend_id"] }
  );
};
