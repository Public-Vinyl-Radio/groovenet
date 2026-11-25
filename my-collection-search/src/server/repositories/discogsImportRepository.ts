/**
 * Discogs imports as background jobs (#1274): the `discogs_imports` rows the
 * in-app worker claims, holds by a lease and reports progress into, and the
 * `discogs_import_log` lines `GET /api/discogs` streams.
 *
 * Two rules live in the SQL, not in the callers:
 * - At most one active (`queued` or `running`) import per username: the
 *   partial unique index `discogs_imports_one_active_per_username`. `create`
 *   inserts with `ON CONFLICT DO NOTHING`, so of two concurrent requests one
 *   inserts and the other reads the winner's row back.
 * - One worker per import: `claimNext` takes a row with `FOR UPDATE SKIP
 *   LOCKED`, and every later write checks `lease_owner`, so a second replica
 *   or a hot-reload's second worker can neither claim a held row nor write to
 *   one it lost. A row whose lease ran out (its process died) is claimable
 *   again, which is how an import resumes after a restart.
 */
import { dbQuery } from "@/lib/serverDb";

export const DISCOGS_IMPORT_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "interrupted",
] as const;
export type DiscogsImportStatus = (typeof DISCOGS_IMPORT_STATUSES)[number];
export const DISCOGS_IMPORT_PHASES = [
  "queued",
  "listing",
  "fetching",
  "ingesting",
  "done",
] as const;
export type DiscogsImportPhase = (typeof DISCOGS_IMPORT_PHASES)[number];

export type DiscogsImportRow = {
  id: number;
  username: string;
  status: DiscogsImportStatus;
  phase: DiscogsImportPhase;
  found: number;
  total: number | null;
  fetched: number;
  added: number;
  removed: number;
  failed_releases: number;
  last_error: string | null;
  attempts: number;
  lease_owner: string | null;
  /** Running, but its lease ran out: the process holding it is gone. */
  stalled: boolean;
  created_at: string;
  started_at: string | null;
  updated_at: string;
  finished_at: string | null;
};

/** Counters the worker reports as it goes. */
export type DiscogsImportProgress = Partial<
  Pick<
    DiscogsImportRow,
    "phase" | "found" | "total" | "fetched" | "added" | "removed" | "failed_releases"
  >
>;

export type DiscogsImportLogLine = { id: number; line: string };

const PROGRESS_FIELDS = [
  "phase",
  "found",
  "total",
  "fetched",
  "added",
  "removed",
  "failed_releases",
] as const;

const SELECT = `
  id, username, status, phase, found, total, fetched, added, removed, failed_releases,
  last_error, attempts, lease_owner,
  (status = 'running' AND lease_expires_at < now()) AS stalled,
  created_at, started_at, updated_at, finished_at`;

const ACTIVE = `status IN ('queued', 'running')`;

export class DiscogsImportRepository {
  /**
   * Queue an import for `username`, or return the one already active.
   * `created` says which. A loser of the insert race whose winner finished
   * before it could read the row back tries again.
   */
  async create(username: string): Promise<{ row: DiscogsImportRow; created: boolean }> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const inserted = await dbQuery<DiscogsImportRow>(
        `INSERT INTO discogs_imports (username) VALUES ($1)
         ON CONFLICT (lower(username)) WHERE ${ACTIVE} DO NOTHING
         RETURNING ${SELECT}`,
        [username],
      );
      if (inserted.rows[0]) return { row: inserted.rows[0], created: true };
      const active = await this.findActive(username);
      if (active) return { row: active, created: false };
    }
    throw new Error(`Could not queue a Discogs import for ${username}`);
  }

  async findActive(username: string): Promise<DiscogsImportRow | null> {
    const { rows } = await dbQuery<DiscogsImportRow>(
      `SELECT ${SELECT} FROM discogs_imports WHERE lower(username) = lower($1) AND ${ACTIVE}
       ORDER BY id DESC LIMIT 1`,
      [username],
    );
    return rows[0] ?? null;
  }

  async get(id: number): Promise<DiscogsImportRow | null> {
    const { rows } = await dbQuery<DiscogsImportRow>(
      `SELECT ${SELECT} FROM discogs_imports WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** The latest import per username, newest first; only active ones with `activeOnly`. */
  async listLatest(options: { activeOnly?: boolean } = {}): Promise<DiscogsImportRow[]> {
    const { rows } = await dbQuery<DiscogsImportRow>(
      `SELECT * FROM (
         SELECT DISTINCT ON (lower(username)) ${SELECT}
         FROM discogs_imports
         ${options.activeOnly ? `WHERE ${ACTIVE}` : ""}
         ORDER BY lower(username), id DESC
       ) latest
       ORDER BY id DESC`,
    );
    return rows;
  }

  /**
   * Take the oldest queued import, or a running one whose lease ran out, for
   * `owner` until `leaseSeconds` from now. Null when there is none to take.
   */
  async claimNext(owner: string, leaseSeconds: number): Promise<DiscogsImportRow | null> {
    const { rows } = await dbQuery<DiscogsImportRow>(
      `UPDATE discogs_imports
       SET status = 'running',
           lease_owner = $1,
           lease_expires_at = now() + make_interval(secs => $2),
           attempts = attempts + 1,
           started_at = COALESCE(started_at, now()),
           updated_at = now()
       WHERE id = (
         SELECT id FROM discogs_imports
         WHERE status = 'queued' OR (status = 'running' AND lease_expires_at < now())
         ORDER BY id
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       RETURNING ${SELECT}`,
      [owner, leaseSeconds],
    );
    return rows[0] ?? null;
  }

  /** Extend `owner`'s lease. False when it no longer holds the import. */
  async heartbeat(id: number, owner: string, leaseSeconds: number): Promise<boolean> {
    const { rowCount } = await dbQuery(
      `UPDATE discogs_imports
       SET lease_expires_at = now() + make_interval(secs => $3), updated_at = now()
       WHERE id = $1 AND lease_owner = $2 AND status = 'running'`,
      [id, owner, leaseSeconds],
    );
    return (rowCount ?? 0) > 0;
  }

  /** Write progress counters. False when `owner` no longer holds the import. */
  async updateProgress(
    id: number,
    owner: string,
    progress: DiscogsImportProgress,
  ): Promise<boolean> {
    const sets: string[] = [];
    const values: unknown[] = [id, owner];
    for (const field of PROGRESS_FIELDS) {
      if (progress[field] === undefined) continue;
      values.push(progress[field]);
      sets.push(`${field} = $${values.length}`);
    }
    if (sets.length === 0) return true;
    const { rowCount } = await dbQuery(
      `UPDATE discogs_imports SET ${sets.join(", ")}, updated_at = now()
       WHERE id = $1 AND lease_owner = $2 AND status = 'running'`,
      values,
    );
    return (rowCount ?? 0) > 0;
  }

  /** End `owner`'s run. False when it no longer held the import. */
  async finish(
    id: number,
    owner: string,
    status: Extract<DiscogsImportStatus, "completed" | "failed" | "interrupted">,
    lastError: string | null,
  ): Promise<boolean> {
    const { rowCount } = await dbQuery(
      `UPDATE discogs_imports
       SET status = $3, last_error = $4,
           phase = CASE WHEN $3 = 'completed' THEN 'done' ELSE phase END,
           lease_owner = NULL, lease_expires_at = NULL,
           finished_at = now(), updated_at = now()
       WHERE id = $1 AND lease_owner = $2 AND status = 'running'`,
      [id, owner, status, lastError],
    );
    return (rowCount ?? 0) > 0;
  }

  async appendLog(id: number, lines: string[]): Promise<void> {
    if (lines.length === 0) return;
    await dbQuery(
      `INSERT INTO discogs_import_log (import_id, line) SELECT $1, unnest($2::text[])`,
      [id, lines],
    );
  }

  async readLog(id: number, after: number, limit: number): Promise<DiscogsImportLogLine[]> {
    const { rows } = await dbQuery<{ id: string; line: string }>(
      `SELECT id, line FROM discogs_import_log WHERE import_id = $1 AND id > $2
       ORDER BY id LIMIT $3`,
      [id, after, limit],
    );
    // bigserial comes back as a string.
    return rows.map((row) => ({ id: Number(row.id), line: row.line }));
  }

  /** Keep the latest `keep` finished imports per username; their logs go with them. */
  async prune(username: string, keep: number): Promise<void> {
    await dbQuery(
      `DELETE FROM discogs_imports
       WHERE lower(username) = lower($1) AND NOT (${ACTIVE})
         AND id NOT IN (
           SELECT id FROM discogs_imports WHERE lower(username) = lower($1)
           ORDER BY id DESC LIMIT $2
         )`,
      [username, keep],
    );
  }
}

export const discogsImportRepository = new DiscogsImportRepository();
