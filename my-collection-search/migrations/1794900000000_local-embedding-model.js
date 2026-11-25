export const shorthands = undefined;

export const up = (pgm) => {
  for (const kind of ["identity", "audio_vibe", "context"]) {
    pgm.sql(`
      CREATE INDEX idx_track_embeddings_${kind}_bge_small
      ON track_embeddings
      USING ivfflat ((embedding::vector(384)) vector_cosine_ops)
      WITH (lists = 100)
      WHERE embedding_type = '${kind}' AND model = 'bge-small-en-v1.5';
    `);
  }
  pgm.addColumns("embedding_model_settings", {
    default_initialized: { type: "boolean", notNull: true, default: true },
  });
  // Preserve populated libraries and explicit model switches on upgrade.
  // First app startup chooses the default with its actual runtime key.
  pgm.sql(`
    UPDATE embedding_model_settings s SET default_initialized = false
    WHERE target_model = 'text-embedding-3-small' AND target_dims = 1536
      AND serving_model = target_model AND serving_dims = target_dims
      AND NOT EXISTS (SELECT 1 FROM track_embeddings e WHERE e.embedding_type = s.embedding_type);
  `);
};

export const down = (pgm) => {
  for (const kind of ["identity", "audio_vibe", "context"]) {
    pgm.sql(`DROP INDEX IF EXISTS idx_track_embeddings_${kind}_bge_small;`);
  }
  pgm.dropColumns("embedding_model_settings", ["default_initialized"]);
};
