/**
 * Add per-library embedding prompt template settings.
 * Mirrors ai_prompt_settings shape but dedicated to embeddings.
 */
export const up = (pgm) => {
  pgm.createTable("embedding_prompt_settings", {
    friend_id: {
      type: "integer",
      notNull: true,
      references: "friends(id)",
      onDelete: "CASCADE",
    },
    prompt_template: {
      type: "text",
      notNull: true,
    },
    updated_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  pgm.addConstraint("embedding_prompt_settings", "embedding_prompt_settings_pk", {
    primaryKey: ["friend_id"],
  });
};

export const down = (pgm) => {
  pgm.dropTable("embedding_prompt_settings");
};
