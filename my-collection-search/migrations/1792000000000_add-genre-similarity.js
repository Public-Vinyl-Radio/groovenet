/**
 * Ranked "similar genres" (#377): taxonomy position plus how often genres
 * co-occur in the collection, recomputed whole-table by
 * `genreSimilarityService.recomputeGenreSimilarity`. `signals` records what
 * produced the score (e.g. `{"taxonomy":"sibling","npmi":0.42,"shared_albums":7}`)
 * so the genre page can explain it, not just rank it.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.createTable("genre_similarity", {
    genre_id: {
      type: "uuid",
      notNull: true,
      references: "genres(id)",
      onDelete: "CASCADE",
    },
    related_genre_id: {
      type: "uuid",
      notNull: true,
      references: "genres(id)",
      onDelete: "CASCADE",
    },
    score: { type: "real", notNull: true },
    signals: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") },
    computed_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });
  pgm.addConstraint("genre_similarity", "genre_similarity_pkey", {
    primaryKey: ["genre_id", "related_genre_id"],
  });
  pgm.addConstraint("genre_similarity", "genre_similarity_no_self", {
    check: "genre_id <> related_genre_id",
  });
  // The read side looks up by genre_id and orders by score desc (GenreSimilarityRepository.topForGenre).
  pgm.createIndex("genre_similarity", ["genre_id", { name: "score", sort: "DESC" }], {
    name: "idx_genre_similarity_genre_id_score",
  });
};

export const down = (pgm) => {
  pgm.dropTable("genre_similarity");
};
