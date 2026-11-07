/** Keep merged identities as redirects, including their external IDs (#706). */
export const up = (pgm) => {
  pgm.addColumns("artists", {
    credit_override: { type: "jsonb" },
    reviewed: { type: "boolean", notNull: true, default: false },
    merged_into: { type: "integer", references: "artists", check: "merged_into <> id" },
  });
  pgm.addColumns("artist_aliases", {
    is_manual: { type: "boolean", notNull: true, default: false },
  });
  pgm.createTable("artist_merges", {
    id: "id",
    source_id: { type: "integer", notNull: true, references: "artists" },
    target_id: { type: "integer", notNull: true, references: "artists" },
    before_state: { type: "jsonb", notNull: true },
    after_state: { type: "jsonb", notNull: true },
    undone: { type: "boolean", notNull: true, default: false },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
};
export const down = (pgm) => {
  pgm.dropTable("artist_merges");
  pgm.dropColumns("artist_aliases", ["is_manual"]);
  pgm.dropColumns("artists", ["reviewed", "merged_into", "credit_override"]);
};
