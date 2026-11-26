export const shorthands = undefined;

/**
 * Alternate audio copies of a track (#1310). `tracks.local_audio_url` stays the
 * primary file every consumer reads; this table links the other formats that
 * sit beside it, typically the AAC kept next to a lossless FLAC.
 */
export function up(pgm) {
  pgm.createTable("track_audio_files", {
    track_id: { type: "varchar(255)", notNull: true },
    friend_id: { type: "integer", notNull: true },
    filename: { type: "text", notNull: true },
    container: { type: "text" },
    codec: { type: "text" },
    lossless: { type: "boolean" },
    sample_rate: { type: "integer" },
    bit_depth: { type: "integer" },
    bitrate: { type: "integer" },
    channels: { type: "integer" },
    size_bytes: { type: "bigint" },
    source: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("track_audio_files", "track_audio_files_pkey", {
    primaryKey: ["track_id", "friend_id", "filename"],
  });
  pgm.addConstraint("track_audio_files", "track_audio_files_track_fkey", {
    foreignKeys: {
      columns: ["track_id", "friend_id"],
      references: "tracks(track_id, friend_id)",
      onDelete: "CASCADE",
    },
  });
}

export function down(pgm) {
  pgm.dropTable("track_audio_files");
}
