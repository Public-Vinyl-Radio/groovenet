/**
 * Reference fingerprint index for live vinyl matching.
 *
 * Keyed on (track_id, friend_id, fingerprint_type, fingerprint_version) so that
 * several engines — and several versions of one engine — can index the same
 * track side by side. Re-fingerprinting after an engine change is then an
 * insert, never a destructive migration.
 *
 * No companion `fingerprint_hashes` inverted index: the spike in #271 measured
 * Chromaprint at 8.2 KiB/track, so the whole library is ~31 MB and rebuilds its
 * postings index in memory in 2.3 s. One blob per track is enough.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  // `tracks` is keyed (track_id, username); friend_id is the normalised form of
  // username and is written from the same friend row, so (track_id, friend_id)
  // is already unique. Declaring it lets fingerprints carry a real foreign key
  // and cascade on track deletion instead of leaving orphans behind.
  pgm.addConstraint("tracks", "tracks_track_id_friend_id_key", {
    unique: ["track_id", "friend_id"],
  });

  pgm.createTable("track_fingerprints", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    track_id: {
      type: "varchar(255)",
      notNull: true,
    },
    friend_id: {
      type: "integer",
      notNull: true,
      references: "friends(id)",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    // panako | chromaprint | ... — varchar rather than an enum so a new engine
    // needs no migration.
    fingerprint_type: {
      type: "varchar(50)",
      notNull: true,
    },
    fingerprint_version: {
      type: "varchar(50)",
      notNull: true,
    },
    // Engine-dependent payload. Chromaprint stores its raw uint32 frames.
    fingerprint_data: {
      type: "bytea",
    },
    audio_sha256: {
      type: "varchar(64)",
      notNull: true,
    },
    audio_duration_seconds: {
      type: "real",
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

  pgm.addConstraint("track_fingerprints", "track_fingerprints_track_fk", {
    foreignKeys: {
      columns: ["track_id", "friend_id"],
      references: "tracks(track_id, friend_id)",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
  });

  pgm.addConstraint("track_fingerprints", "track_fingerprints_unique_version", {
    unique: ["track_id", "friend_id", "fingerprint_type", "fingerprint_version"],
  });

  // Loading one engine+version's whole index into memory at startup.
  pgm.createIndex("track_fingerprints", ["fingerprint_type", "fingerprint_version"], {
    name: "idx_track_fingerprints_type_version",
  });

  // Staleness checks key off the source audio hash.
  pgm.createIndex("track_fingerprints", "audio_sha256", {
    name: "idx_track_fingerprints_audio_sha256",
  });

  pgm.createIndex("track_fingerprints", "friend_id", {
    name: "idx_track_fingerprints_friend_id",
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable("track_fingerprints");
  pgm.dropConstraint("tracks", "tracks_track_id_friend_id_key");
};
