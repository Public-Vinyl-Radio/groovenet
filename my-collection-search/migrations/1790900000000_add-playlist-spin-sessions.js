/** Attribute playlist-derived spins and make each playlist performance replay-safe. */
export const up = (pgm) => {
  pgm.dropConstraint("spin_sessions", "spin_sessions_selection_mode_check");
  pgm.addConstraint("spin_sessions", "spin_sessions_selection_mode_check", {
    check: "selection_mode IN ('sides', 'tracks', 'automatic', 'playlist')",
  });

  pgm.dropConstraint("spin_sessions", "spin_sessions_provenance_check");
  pgm.addConstraint("spin_sessions", "spin_sessions_provenance_check", {
    check: "provenance IN ('manual', 'automatic', 'playlist')",
  });

  pgm.addColumns("spin_sessions", {
    playlist_id: {
      type: "integer",
      references: "playlists(id)",
      onDelete: "RESTRICT",
    },
    live_set_performance_id: {
      type: "integer",
      references: "live_set_performances(id)",
      onDelete: "RESTRICT",
    },
    // The common start time is retained even though individual sessions may
    // be offset. It is the idempotency key when there is no performance row.
    playlist_played_at: { type: "timestamptz" },
    playlist_position: { type: "integer" },
  });

  pgm.dropConstraint("spin_sessions", "spin_sessions_automatic_payload_check");
  pgm.addConstraint("spin_sessions", "spin_sessions_provenance_payload_check", {
    check: `
      (provenance = 'manual'
        AND source_id IS NULL AND detection_id IS NULL
        AND playlist_id IS NULL AND live_set_performance_id IS NULL
        AND playlist_played_at IS NULL AND playlist_position IS NULL)
      OR
      (provenance = 'automatic'
        AND source_id IS NOT NULL AND detection_id IS NOT NULL
        AND playlist_id IS NULL AND live_set_performance_id IS NULL
        AND playlist_played_at IS NULL AND playlist_position IS NULL)
      OR
      (provenance = 'playlist'
        AND source_id IS NULL AND detection_id IS NULL
        AND playlist_id IS NOT NULL AND playlist_played_at IS NOT NULL
        AND playlist_position IS NOT NULL)
    `,
  });

  pgm.createIndex(
    "spin_sessions",
    ["playlist_id", "live_set_performance_id", "playlist_position"],
    {
      name: "spin_sessions_playlist_performance_unique",
      unique: true,
      where: "provenance = 'playlist' AND live_set_performance_id IS NOT NULL",
    }
  );
  pgm.createIndex(
    "spin_sessions",
    ["playlist_id", "playlist_played_at", "playlist_position"],
    {
      name: "spin_sessions_playlist_timestamp_unique",
      unique: true,
      where: "provenance = 'playlist' AND live_set_performance_id IS NULL",
    }
  );
};

export const down = (pgm) => {
  pgm.dropIndex("spin_sessions", ["playlist_id", "playlist_played_at", "playlist_position"], {
    name: "spin_sessions_playlist_timestamp_unique",
  });
  pgm.dropIndex("spin_sessions", ["playlist_id", "live_set_performance_id", "playlist_position"], {
    name: "spin_sessions_playlist_performance_unique",
  });
  pgm.dropConstraint("spin_sessions", "spin_sessions_provenance_payload_check");
  pgm.dropColumns("spin_sessions", [
    "playlist_id",
    "live_set_performance_id",
    "playlist_played_at",
    "playlist_position",
  ]);
  pgm.addConstraint("spin_sessions", "spin_sessions_automatic_payload_check", {
    check: "(provenance = 'manual' AND source_id IS NULL AND detection_id IS NULL) OR (provenance = 'automatic' AND source_id IS NOT NULL AND detection_id IS NOT NULL)",
  });
  pgm.dropConstraint("spin_sessions", "spin_sessions_provenance_check");
  pgm.addConstraint("spin_sessions", "spin_sessions_provenance_check", {
    check: "provenance IN ('manual', 'automatic')",
  });
  pgm.dropConstraint("spin_sessions", "spin_sessions_selection_mode_check");
  pgm.addConstraint("spin_sessions", "spin_sessions_selection_mode_check", {
    check: "selection_mode IN ('sides', 'tracks', 'automatic')",
  });
};
