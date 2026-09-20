/**
 * Keep the durable record of listener-device uploads separate from the audio
 * file, which may be removed once its processing is complete.
 */
export const up = (pgm) => {
  pgm.createTable("audio_ingests", {
    id: { type: "uuid", primaryKey: true },
    source_id: { type: "varchar(255)", notNull: true },
    session_id: { type: "varchar(255)" },
    sequence: { type: "bigint" },
    captured_at: { type: "timestamptz" },
    received_at: { type: "timestamptz", notNull: true },
    duration_seconds: { type: "real" },
    sample_rate: { type: "integer" },
    channels: { type: "integer" },
    codec: { type: "varchar(100)" },
    file_path: { type: "text" },
    status: { type: "varchar(20)", notNull: true, default: "received" },
    error: { type: "text" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });

  pgm.addConstraint("audio_ingests", "audio_ingests_status_check", {
    check: "status IN ('received', 'processing', 'processed', 'failed')",
  });
  pgm.createIndex("audio_ingests", ["source_id", "session_id", "sequence"], {
    name: "audio_ingests_source_session_sequence_unique",
    unique: true,
    where: "source_id IS NOT NULL AND session_id IS NOT NULL AND sequence IS NOT NULL",
  });
  pgm.createIndex("audio_ingests", ["source_id", "received_at"], {
    name: "audio_ingests_source_received_at_idx",
  });
};

export const down = (pgm) => {
  pgm.dropTable("audio_ingests");
};
