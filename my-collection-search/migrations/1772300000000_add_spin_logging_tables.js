/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createTable("spin_sessions", {
    id: {
      type: "serial",
      primaryKey: true,
    },
    friend_id: {
      type: "integer",
      notNull: true,
      references: "friends(id)",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    release_id: {
      type: "varchar(255)",
      notNull: true,
    },
    medium: {
      type: "varchar(20)",
      notNull: true,
      default: "vinyl",
    },
    selection_mode: {
      type: "varchar(20)",
      notNull: true,
    },
    played_at: {
      type: "timestamptz",
      notNull: true,
    },
    note: {
      type: "text",
    },
    context_type: {
      type: "varchar(50)",
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  pgm.addConstraint("spin_sessions", "spin_sessions_medium_check", {
    check: "medium IN ('vinyl')",
  });

  pgm.addConstraint("spin_sessions", "spin_sessions_selection_mode_check", {
    check: "selection_mode IN ('sides', 'tracks')",
  });

  pgm.createTable("spin_session_selections", {
    id: {
      type: "serial",
      primaryKey: true,
    },
    session_id: {
      type: "integer",
      notNull: true,
      references: "spin_sessions(id)",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    ordinal: {
      type: "integer",
      notNull: true,
    },
    selection_type: {
      type: "varchar(20)",
      notNull: true,
    },
    side_key: {
      type: "varchar(32)",
    },
    track_id: {
      type: "varchar(255)",
    },
    friend_id: {
      type: "integer",
      references: "friends(id)",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    position_snapshot: {
      type: "varchar(50)",
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  pgm.addConstraint("spin_session_selections", "spin_session_selections_selection_type_check", {
    check: "selection_type IN ('side', 'track')",
  });

  pgm.addConstraint("spin_session_selections", "spin_session_selections_payload_check", {
    check: `
        (
          selection_type = 'side'
          AND side_key IS NOT NULL
          AND track_id IS NULL
        )
        OR
        (
          selection_type = 'track'
          AND track_id IS NOT NULL
        )
      `,
  });

  pgm.createTable("track_spin_events", {
    id: {
      type: "serial",
      primaryKey: true,
    },
    session_id: {
      type: "integer",
      notNull: true,
      references: "spin_sessions(id)",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    friend_id: {
      type: "integer",
      notNull: true,
      references: "friends(id)",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    release_id: {
      type: "varchar(255)",
      notNull: true,
    },
    track_id: {
      type: "varchar(255)",
      notNull: true,
    },
    played_at: {
      type: "timestamptz",
      notNull: true,
    },
    ordinal: {
      type: "integer",
      notNull: true,
    },
    side_key: {
      type: "varchar(32)",
    },
    position_snapshot: {
      type: "varchar(50)",
    },
    title_snapshot: {
      type: "varchar(255)",
      notNull: true,
    },
    artist_snapshot: {
      type: "varchar(255)",
      notNull: true,
    },
    album_snapshot: {
      type: "varchar(255)",
      notNull: true,
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  pgm.createIndex("spin_sessions", ["friend_id", "played_at"], {
    name: "idx_spin_sessions_friend_played_at",
  });
  pgm.createIndex("spin_sessions", ["friend_id", "release_id", "played_at"], {
    name: "idx_spin_sessions_friend_release_played_at",
  });
  pgm.createIndex("track_spin_events", ["friend_id", "track_id", "played_at"], {
    name: "idx_track_spin_events_friend_track_played_at",
  });
  pgm.createIndex("track_spin_events", ["friend_id", "release_id", "played_at"], {
    name: "idx_track_spin_events_friend_release_played_at",
  });
  pgm.createIndex("track_spin_events", ["session_id", "ordinal"], {
    name: "idx_track_spin_events_session_ordinal",
  });
  pgm.createIndex("spin_session_selections", ["session_id", "ordinal"], {
    name: "idx_spin_session_selections_session_ordinal",
    unique: true,
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable("track_spin_events");
  pgm.dropTable("spin_session_selections");
  pgm.dropTable("spin_sessions");
};
