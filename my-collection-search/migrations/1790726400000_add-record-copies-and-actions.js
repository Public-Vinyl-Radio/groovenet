/**
 * Physical record copies and the care actions logged against them (#262).
 *
 * A release can stand for more than one physical copy, and cleaning, sleeving
 * and condition belong to a copy, not to the release. `record_copies` is one
 * row per copy; `record_actions` is its history.
 *
 * Neither table references `albums`: Discogs cleanup deletes an album whose
 * release left the collection, and a cascade would take the care history with
 * it. Spins make the same choice. Copies cascade from the friend only.
 *
 * Copies are created lazily. A release with no row here has one implicit copy,
 * which becomes a real row (`is_default`) the first time an action is logged
 * against the release. Nothing is backfilled.
 *
 * `last_cleaned_at` and `inner_sleeve_type` are a cache of the copy's live
 * actions, recomputed from them in the same transaction as every action write
 * or void. They exist so the care views filter on an indexed column rather
 * than aggregating every copy's history.
 *
 * Both tables soft-delete (`deleted_at`, `voided_at`) so nothing logged is
 * ever lost.
 */
const SLEEVE_TYPES = "'original', 'paper', 'poly-rice-paper-poly', 'poly'";

export const up = (pgm) => {
  pgm.createTable("record_copies", {
    id: { type: "serial", primaryKey: true },
    friend_id: {
      type: "integer",
      notNull: true,
      references: "friends(id)",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    release_id: { type: "varchar(255)", notNull: true },
    // The copy an action logged against the release lands on.
    is_default: { type: "boolean", notNull: true, default: false },
    label: { type: "varchar(100)" },
    notes: { type: "text" },
    // Cached from record_actions. Null: no sleeve has been logged.
    inner_sleeve_type: { type: "varchar(32)" },
    last_cleaned_at: { type: "timestamptz" },
    deleted_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });

  pgm.addConstraint("record_copies", "record_copies_inner_sleeve_type_check", {
    check: `inner_sleeve_type IN (${SLEEVE_TYPES})`,
  });

  // One live default per release. The lazy create relies on this index to make
  // two concurrent first actions agree on one copy (ON CONFLICT DO NOTHING).
  pgm.createIndex("record_copies", ["friend_id", "release_id"], {
    name: "idx_record_copies_one_default",
    unique: true,
    where: "is_default AND deleted_at IS NULL",
  });
  pgm.createIndex("record_copies", ["friend_id", "release_id"], {
    name: "idx_record_copies_friend_release",
    where: "deleted_at IS NULL",
  });
  pgm.createIndex("record_copies", ["friend_id", "last_cleaned_at"], {
    name: "idx_record_copies_friend_last_cleaned",
    where: "deleted_at IS NULL",
  });

  pgm.createTable("record_actions", {
    id: { type: "serial", primaryKey: true },
    copy_id: {
      type: "integer",
      notNull: true,
      references: "record_copies(id)",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    friend_id: {
      type: "integer",
      notNull: true,
      references: "friends(id)",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    action_type: { type: "varchar(20)", notNull: true },
    occurred_at: { type: "timestamptz", notNull: true },
    notes: { type: "text" },
    // A column rather than a key in details, so the database enforces it.
    sleeve_type: { type: "varchar(32)" },
    // Per-type extras, validated by the API: { method } for a cleaning.
    details: { type: "jsonb", notNull: true, default: "{}" },
    voided_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });

  // `played` arrives with the spins integration (#262 phase 4).
  pgm.addConstraint("record_actions", "record_actions_action_type_check", {
    check: "action_type IN ('cleaned', 'sleeved', 'inspected', 'repaired')",
  });
  pgm.addConstraint("record_actions", "record_actions_sleeve_type_check", {
    check: `sleeve_type IN (${SLEEVE_TYPES})`,
  });
  pgm.addConstraint("record_actions", "record_actions_sleeve_payload_check", {
    check: "(action_type = 'sleeved') = (sleeve_type IS NOT NULL)",
  });

  pgm.createIndex("record_actions", ["copy_id", "occurred_at"], {
    name: "idx_record_actions_copy_occurred_at",
  });
};

export const down = (pgm) => {
  pgm.dropTable("record_actions");
  pgm.dropTable("record_copies");
};
