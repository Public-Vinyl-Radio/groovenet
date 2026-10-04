/**
 * Model settings and the ANN index for `context` embeddings (#408). Seeded
 * on the same model as identity, where #382 measured the context text; a
 * different model only needs a target/serving switch (#386).
 */
export const shorthands = undefined;

export const up = (pgm) => {
  pgm.sql(`
    INSERT INTO embedding_model_settings
      (embedding_type, target_model, target_dims, serving_model, serving_dims)
    VALUES ('context', 'text-embedding-3-small', 1536, 'text-embedding-3-small', 1536)
    ON CONFLICT (embedding_type) DO NOTHING;
  `);

  pgm.sql(`
    CREATE INDEX idx_track_embeddings_context_openai_small
    ON track_embeddings
    USING ivfflat ((embedding::vector(1536)) vector_cosine_ops)
    WITH (lists = 100)
    WHERE embedding_type = 'context' AND model = 'text-embedding-3-small';
  `);
};

export const down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS idx_track_embeddings_context_openai_small;`);
  pgm.sql(`DELETE FROM track_embeddings WHERE embedding_type = 'context';`);
  pgm.sql(`DELETE FROM embedding_model_settings WHERE embedding_type = 'context';`);
};
