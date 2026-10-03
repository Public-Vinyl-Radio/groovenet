/**
 * Multi-model support for identity/audio_vibe embeddings (#386).
 *
 * `track_embeddings.embedding` was `vector(1536)`, and its unique constraint
 * was `(track_id, friend_id, embedding_type)` — so re-embedding a track with
 * a different model overwrote its only row for that type in place. That
 * makes a model switch unsafe: there's no way to build the new model's set
 * while the old one is still being served, which a template-version bump
 * (#382) can get away with (same model, same dims) but a model switch can't
 * (different dims can't share an index, and comparing across models is
 * meaningless).
 *
 * This migration: drops the column's fixed dimension (pgvector can't index
 * an unconstrained `vector` column directly, but a partial expression index
 * per `(embedding_type, model)` works, since every row a partial predicate
 * admits shares one dimension — verified against pgvector 0.8.6), widens the
 * unique constraint to include `model` so two models can coexist per track,
 * and adds `embedding_model_settings` to hold each kind's target model (what
 * new jobs embed with) and serving model (what similarity queries read),
 * seeded equal so this ships as a no-op.
 */
export const shorthands = undefined;

export const up = async (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS idx_track_embeddings_vector_cosine;`);

  pgm.alterColumn("track_embeddings", "embedding", {
    type: "vector",
  });

  pgm.dropConstraint("track_embeddings", "track_embeddings_unique_track_type");
  pgm.addConstraint("track_embeddings", "track_embeddings_unique_track_type_model", {
    unique: ["track_id", "friend_id", "embedding_type", "model"],
  });

  // One partial expression index per (embedding_type, model) pair in active
  // use today. Adding a new model later means a new migration adding its own
  // index here — see docs/IDENTITY_EMBEDDINGS.md for the pattern.
  pgm.sql(`
    CREATE INDEX idx_track_embeddings_identity_openai_small
    ON track_embeddings
    USING ivfflat ((embedding::vector(1536)) vector_cosine_ops)
    WITH (lists = 100)
    WHERE embedding_type = 'identity' AND model = 'text-embedding-3-small';
  `);

  pgm.sql(`
    CREATE INDEX idx_track_embeddings_audio_vibe_openai_small
    ON track_embeddings
    USING ivfflat ((embedding::vector(1536)) vector_cosine_ops)
    WITH (lists = 100)
    WHERE embedding_type = 'audio_vibe' AND model = 'text-embedding-3-small';
  `);

  pgm.createTable("embedding_model_settings", {
    embedding_type: {
      type: "embedding_type_enum",
      notNull: true,
    },
    target_model: {
      type: "varchar(100)",
      notNull: true,
    },
    target_dims: {
      type: "integer",
      notNull: true,
    },
    serving_model: {
      type: "varchar(100)",
      notNull: true,
    },
    serving_dims: {
      type: "integer",
      notNull: true,
    },
    updated_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  pgm.addConstraint("embedding_model_settings", "embedding_model_settings_pk", {
    primaryKey: ["embedding_type"],
  });

  pgm.sql(`
    INSERT INTO embedding_model_settings
      (embedding_type, target_model, target_dims, serving_model, serving_dims)
    VALUES
      ('identity', 'text-embedding-3-small', 1536, 'text-embedding-3-small', 1536),
      ('audio_vibe', 'text-embedding-3-small', 1536, 'text-embedding-3-small', 1536);
  `);
};

export const down = async (pgm) => {
  pgm.dropTable("embedding_model_settings");
  pgm.sql(`DROP INDEX IF EXISTS idx_track_embeddings_audio_vibe_openai_small;`);
  pgm.sql(`DROP INDEX IF EXISTS idx_track_embeddings_identity_openai_small;`);
  pgm.dropConstraint("track_embeddings", "track_embeddings_unique_track_type_model");

  // Reverting to a fixed vector(1536) column fails if a 768-dim row was ever
  // written under the new schema — accept that `down` is a best-effort
  // rollback for the common case, not a general downgrade path.
  pgm.alterColumn("track_embeddings", "embedding", {
    type: "vector(1536)",
  });
  pgm.addConstraint("track_embeddings", "track_embeddings_unique_track_type", {
    unique: ["track_id", "friend_id", "embedding_type"],
  });
  pgm.sql(`
    CREATE INDEX idx_track_embeddings_vector_cosine
    ON track_embeddings
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
  `);
};
