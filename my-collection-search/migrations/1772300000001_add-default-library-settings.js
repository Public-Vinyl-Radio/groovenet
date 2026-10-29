/**
 * Persist a single default library selection for the app.
 */
export const up = (pgm) => {
  pgm.createTable("default_library_settings", {
    id: {
      type: "integer",
      primaryKey: true,
      default: 1,
    },
    friend_id: {
      type: "integer",
      references: "friends(id)",
      onDelete: "SET NULL",
    },
    updated_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  pgm.addConstraint(
    "default_library_settings",
    "default_library_settings_singleton_check",
    "CHECK (id = 1)",
  );
};

export const down = (pgm) => {
  pgm.dropTable("default_library_settings");
};
