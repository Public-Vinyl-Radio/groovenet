/**
 * Ranking profiles (#1192, epic #1190).
 *
 * - `ranking_profiles`: a friend's own profiles. `config` holds the ranker
 *   config (weights, base, usePrior, constraints) as the app's zod schema
 *   defines it, and `version` is that schema's version, for migrating rows when
 *   it changes. The app validates every row it reads; one that no longer
 *   parses ranks as Default and is never an error, so the database checks only
 *   the shape it can.
 * - `ranking_profile_selections`: the profile chosen per friend and surface.
 *   A preset is named by `preset_id` (presets live in code), a stored profile
 *   by `profile_id`. No row means Default; deleting a profile deletes the
 *   selections that chose it, so those surfaces go back to Default.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

const SURFACES = ["suggestions", "related", "recommendations"].map((s) => `'${s}'`).join(", ");

/** @param pgm {import('node-pg-migrate').MigrationBuilder} */
export const up = (pgm) => {
  pgm.createTable("ranking_profiles", {
    id: "id",
    friend_id: {
      type: "integer",
      notNull: true,
      references: "friends(id)",
      onDelete: "CASCADE",
    },
    name: { type: "text", notNull: true, check: "char_length(name) BETWEEN 1 AND 80" },
    description: {
      type: "text",
      notNull: true,
      default: "",
      check: "char_length(description) <= 500",
    },
    surfaces: {
      type: "text[]",
      notNull: true,
      check: `cardinality(surfaces) BETWEEN 1 AND 3 AND surfaces <@ ARRAY[${SURFACES}]::text[]`,
    },
    version: { type: "integer", notNull: true },
    config: { type: "jsonb", notNull: true, check: "jsonb_typeof(config) = 'object'" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.createIndex("ranking_profiles", ["friend_id", "id"]);

  pgm.createTable("ranking_profile_selections", {
    friend_id: {
      type: "integer",
      notNull: true,
      references: "friends(id)",
      onDelete: "CASCADE",
    },
    surface: { type: "text", notNull: true, check: `surface IN (${SURFACES})` },
    preset_id: { type: "text" },
    profile_id: {
      type: "integer",
      references: "ranking_profiles(id)",
      onDelete: "CASCADE",
    },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.addConstraint("ranking_profile_selections", "ranking_profile_selections_pkey", {
    primaryKey: ["friend_id", "surface"],
  });
  pgm.addConstraint("ranking_profile_selections", "ranking_profile_selections_one_profile", {
    check: "num_nonnulls(preset_id, profile_id) = 1",
  });
  pgm.createIndex("ranking_profile_selections", "profile_id", {
    where: "profile_id IS NOT NULL",
  });
};

/** @param pgm {import('node-pg-migrate').MigrationBuilder} */
export const down = (pgm) => {
  pgm.dropTable("ranking_profile_selections");
  pgm.dropTable("ranking_profiles");
};
