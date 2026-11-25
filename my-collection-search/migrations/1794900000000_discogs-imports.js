/**
 * Discogs imports as background jobs (#1274).
 *
 * - `discogs_imports`: one row per import of one Discogs collection. The
 *   in-app worker claims a `queued` row (or a `running` one whose lease ran
 *   out, which is how an import cut short by a restart resumes), holds it by
 *   a lease it renews while it works, and writes the phase and counters as it
 *   goes, so any page, device or reload can show the progress.
 * - At most one active (`queued` or `running`) import per username, enforced
 *   here by a partial unique index, so two concurrent requests can't both
 *   start one; the second gets the first's row back.
 * - `discogs_import_log`: the progress lines the import writes, the same text
 *   `GET /api/discogs` has always streamed. That route now streams this log.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

const STATUSES = ["queued", "running", "completed", "failed", "interrupted"];
const PHASES = ["queued", "listing", "fetching", "ingesting", "done"];
const list = (values) => values.map((v) => `'${v}'`).join(", ");

/** @param pgm {import('node-pg-migrate').MigrationBuilder} */
export const up = (pgm) => {
  pgm.createTable("discogs_imports", {
    id: "id",
    username: { type: "text", notNull: true },
    status: {
      type: "text",
      notNull: true,
      default: "queued",
      check: `status IN (${list(STATUSES)})`,
    },
    phase: { type: "text", notNull: true, default: "queued", check: `phase IN (${list(PHASES)})` },
    /** Releases in the collection listing. */
    found: { type: "integer", notNull: true, default: 0 },
    /** Releases to fetch from Discogs; null until the listing is done. */
    total: { type: "integer" },
    /** Releases fetched (saved or failed) out of `total`. */
    fetched: { type: "integer", notNull: true, default: 0 },
    added: { type: "integer", notNull: true, default: 0 },
    removed: { type: "integer", notNull: true, default: 0 },
    failed_releases: { type: "integer", notNull: true, default: 0 },
    last_error: { type: "text" },
    /** Times a worker has claimed it: more than one means it resumed. */
    attempts: { type: "integer", notNull: true, default: 0 },
    lease_owner: { type: "text" },
    lease_expires_at: { type: "timestamptz" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    started_at: { type: "timestamptz" },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    finished_at: { type: "timestamptz" },
  });
  pgm.sql(`
    CREATE UNIQUE INDEX discogs_imports_one_active_per_username
      ON discogs_imports (lower(username))
      WHERE status IN ('queued', 'running')
  `);
  pgm.createIndex("discogs_imports", ["status", "created_at"]);
  pgm.sql(
    "CREATE INDEX discogs_imports_username_created_idx ON discogs_imports (lower(username), created_at DESC)",
  );

  pgm.createTable("discogs_import_log", {
    id: { type: "bigserial", primaryKey: true },
    import_id: {
      type: "integer",
      notNull: true,
      references: "discogs_imports(id)",
      onDelete: "CASCADE",
    },
    line: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createIndex("discogs_import_log", ["import_id", "id"]);
};

/** @param pgm {import('node-pg-migrate').MigrationBuilder} */
export const down = (pgm) => {
  pgm.dropTable("discogs_import_log");
  pgm.dropTable("discogs_imports");
};
