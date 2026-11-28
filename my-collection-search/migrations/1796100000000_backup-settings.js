/**
 * The backup policy moves from config/backup-policy.yml into Postgres. The file
 * lived inside the image, so the read-only root filesystem (#1074) refused every
 * save, and before that each deploy replaced whatever had been saved.
 *
 * One row (id = 1). `policy` is the policy without `updated_at`, unvalidated:
 * backupPolicyService parses it, so a new field needs no migration.
 *
 * The seed is the policy every image has shipped in that file (backups on,
 * every six hours), in the remote/local shape, so no install's backups change
 * on upgrade.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

const SHIPPED_POLICY = {
  enabled: true,
  provider: "restic-b2",
  schedule_cron: "0 */6 * * *",
  retention_preset: "balanced",
  include_discogs_exports: true,
  include_essentia_files: true,
  include_uploads: true,
  remote: {
    enabled: true,
    include_database: true,
    include_album_covers: true,
    include_aac_audio: true,
    include_lossless_audio: false,
  },
  local: {
    enabled: true,
    include_database: false,
    include_album_covers: false,
    include_aac_audio: false,
    include_lossless_audio: true,
  },
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.createTable("backup_settings", {
    id: { type: "integer", primaryKey: true, default: 1, check: "id = 1" },
    policy: { type: "jsonb", notNull: true },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("current_timestamp") },
  });
  pgm.sql(
    `INSERT INTO backup_settings (id, policy) VALUES (1, '${JSON.stringify(SHIPPED_POLICY)}'::jsonb)`,
  );
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropTable("backup_settings");
};
