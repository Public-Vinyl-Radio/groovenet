/**
 * Reconciling free-text `local_tags` onto the genre taxonomy (#372).
 *
 * A run proposes; a person reviews; apply writes. Proposals are one row per
 * distinct normalised value, global like the taxonomy and its aliases, so a
 * decision made once covers every track and friend using that spelling.
 *
 * `target_genre_ids` is a uuid[] without a foreign key (Postgres cannot
 * reference from an array). Merging a genre rewrites it, and apply skips any id
 * that no longer exists rather than trusting it.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.createTable("genre_reconciliation_runs", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    status: { type: "varchar(20)", notNull: true, default: "running" },
    options: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") },
    model: { type: "text" },
    distinct_values: { type: "integer", notNull: true, default: 0 },
    exact_matches: { type: "integer", notNull: true, default: 0 },
    kept: { type: "integer", notNull: true, default: 0 },
    ai_pending: { type: "integer", notNull: true, default: 0 },
    ai_proposed: { type: "integer", notNull: true, default: 0 },
    ai_failed: { type: "integer", notNull: true, default: 0 },
    ai_batches: { type: "integer", notNull: true, default: 0 },
    input_tokens: { type: "integer", notNull: true, default: 0 },
    output_tokens: { type: "integer", notNull: true, default: 0 },
    cost_usd: { type: "numeric(10,4)", notNull: true, default: 0 },
    error: { type: "text" },
    started_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    // Bumped after every batch, so a run whose process died can be told from a
    // slow one and written off.
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    finished_at: { type: "timestamptz" },
  });
  pgm.addConstraint("genre_reconciliation_runs", "genre_reconciliation_runs_status_check", {
    check: "status IN ('running', 'completed', 'failed')",
  });
  // At most one run at a time: two would pay for the same AI calls twice.
  pgm.createIndex("genre_reconciliation_runs", "status", {
    name: "genre_reconciliation_runs_one_running",
    unique: true,
    where: "status = 'running'",
  });

  pgm.createTable("genre_reconciliation_proposals", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    value_normalized: { type: "text", notNull: true },
    raw_examples: { type: "text[]", notNull: true, default: pgm.func("'{}'::text[]") },
    track_count: { type: "integer", notNull: true, default: 0 },
    action: { type: "varchar(20)", notNull: true },
    target_genre_ids: { type: "uuid[]", notNull: true, default: pgm.func("'{}'::uuid[]") },
    proposed_genre_name: { type: "text" },
    proposed_parent_id: {
      type: "uuid",
      references: "genres(id)",
      onDelete: "SET NULL",
    },
    confidence: { type: "real" },
    method: { type: "varchar(20)", notNull: true },
    status: { type: "varchar(20)", notNull: true, default: "pending" },
    run_id: {
      type: "uuid",
      references: "genre_reconciliation_runs(id)",
      onDelete: "SET NULL",
    },
    // The genre an applied `new_genre` proposal created, so undo can find it.
    created_genre_id: {
      type: "uuid",
      references: "genres(id)",
      onDelete: "SET NULL",
    },
    applied_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.addConstraint("genre_reconciliation_proposals", "genre_reconciliation_proposals_value_key", {
    unique: "value_normalized",
  });
  pgm.addConstraint("genre_reconciliation_proposals", "genre_reconciliation_proposals_action_check", {
    check: "action IN ('map', 'new_genre', 'descriptor', 'drop')",
  });
  pgm.addConstraint("genre_reconciliation_proposals", "genre_reconciliation_proposals_method_check", {
    check: "method IN ('exact', 'ai', 'manual')",
  });
  pgm.addConstraint("genre_reconciliation_proposals", "genre_reconciliation_proposals_status_check", {
    check: "status IN ('pending', 'accepted', 'rejected', 'edited')",
  });
  pgm.createIndex("genre_reconciliation_proposals", ["status", "track_count"], {
    name: "idx_genre_reconciliation_proposals_status",
  });
};

export const down = (pgm) => {
  pgm.dropTable("genre_reconciliation_proposals");
  pgm.dropTable("genre_reconciliation_runs");
};
