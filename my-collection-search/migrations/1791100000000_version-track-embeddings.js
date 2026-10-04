/**
 * Template versions get the same target/serving split as models (#407).
 *
 * A text-template change re-embeds with the same model, and the unique key
 * was `(track_id, friend_id, embedding_type, model)`, so the re-embed
 * overwrote the served rows one by one and similarity read a mix of old and
 * new text until the backfill finished. Adding `template_version` to the key
 * lets both versions coexist; `serving_template_version` is what reads filter
 * to, flipped once the new version's coverage is complete. The target version
 * is the code's `*_TEMPLATE_VERSION` constant, so it needs no column.
 */
export const shorthands = undefined;

export const up = (pgm) => {
  pgm.dropConstraint("track_embeddings", "track_embeddings_unique_track_type_model");
  pgm.addConstraint("track_embeddings", "track_embeddings_unique_track_type_model_version", {
    unique: ["track_id", "friend_id", "embedding_type", "model", "template_version"],
  });

  pgm.addColumns("embedding_model_settings", {
    serving_template_version: { type: "integer", notNull: true, default: 1 },
  });
};

export const down = (pgm) => {
  // The narrower key can't hold two versions of one row: keep only the one
  // each kind was serving.
  pgm.sql(`
    DELETE FROM track_embeddings te
    USING embedding_model_settings s
    WHERE te.embedding_type = s.embedding_type
      AND te.template_version <> s.serving_template_version;
  `);
  pgm.dropColumns("embedding_model_settings", ["serving_template_version"]);
  pgm.dropConstraint("track_embeddings", "track_embeddings_unique_track_type_model_version");
  pgm.addConstraint("track_embeddings", "track_embeddings_unique_track_type_model", {
    unique: ["track_id", "friend_id", "embedding_type", "model"],
  });
};
