/**
 * Tracklists derived from whole set recordings (#282).
 *
 * `set_recordings` is content-addressed: the CLI uploads a recording under its
 * sha256, so the same file can never be stored twice and re-deriving it sends
 * nothing. `set_derivations` is one run of the matcher over one recording —
 * the raw per-window matches, which depend on the recording, the engine and
 * the window settings but not on any playlist. The tracklist and the diff
 * against a plan are computed from them on read.
 */
export const up = (pgm) => {
  pgm.createTable("set_recordings", {
    sha256: { type: "char(64)", primaryKey: true },
    // Relative to SET_RECORDINGS_DIR: `{sha256}.{ext}`, ext from ffprobe.
    file_path: { type: "text", notNull: true },
    original_filename: { type: "text" },
    format_name: { type: "varchar(100)" },
    duration_seconds: { type: "real" },
    size_bytes: { type: "bigint", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });

  pgm.createTable("set_derivations", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    recording_sha256: {
      type: "char(64)",
      notNull: true,
      references: "set_recordings(sha256)",
      onDelete: "CASCADE",
    },
    fingerprint_type: { type: "varchar(50)", notNull: true },
    fingerprint_version: { type: "varchar(50)", notNull: true },
    window_seconds: { type: "real", notNull: true },
    step_seconds: { type: "real", notNull: true },
    status: { type: "varchar(20)", notNull: true, default: "queued" },
    error: { type: "text" },
    duration_seconds: { type: "real" },
    // [{start_seconds, duration_seconds, candidates: [...]}] as the worker
    // reported them. Kept whole: a few hundred windows per set, always read
    // together, never queried into.
    windows: { type: "jsonb" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    completed_at: { type: "timestamptz" },
  });

  pgm.addConstraint("set_derivations", "set_derivations_status_check", {
    check: "status IN ('queued', 'processing', 'processed', 'failed')",
  });
  // Re-deriving the same recording under the same engine and settings returns
  // the existing run; this is the lookup that decides it.
  pgm.createIndex(
    "set_derivations",
    ["recording_sha256", "fingerprint_type", "fingerprint_version", "window_seconds", "step_seconds", "created_at"],
    { name: "set_derivations_reuse_idx" }
  );
};

export const down = (pgm) => {
  pgm.dropTable("set_derivations");
  pgm.dropTable("set_recordings");
};
