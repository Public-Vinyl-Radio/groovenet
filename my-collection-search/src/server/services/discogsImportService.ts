/**
 * Queueing and reading Discogs imports (#1274), shared by
 * `POST /api/discogs/imports`, `GET /api/discogs/imports[/:id[/log]]` and the
 * streaming `GET /api/discogs`, which is now a view over the same job.
 */
import type { DiscogsImport } from "@groovenet/contracts";
import {
  discogsImportRepository,
  type DiscogsImportRepository,
  type DiscogsImportRow,
} from "@/server/repositories/discogsImportRepository";
import { kickDiscogsImportWorker } from "@/server/services/discogsImportWorker";

export const MISSING_CREDENTIALS = "Discogs credentials not set in environment";

export class DiscogsCredentialsMissingError extends Error {
  constructor() {
    super(MISSING_CREDENTIALS);
    this.name = "DiscogsCredentialsMissingError";
  }
}

/** The row as the API returns it: everything but the lease's holder. */
export function toDiscogsImport(row: DiscogsImportRow): DiscogsImport {
  const { lease_owner: _owner, ...rest } = row;
  void _owner;
  const iso = (value: string | Date | null) =>
    value === null ? null : new Date(value).toISOString();
  return {
    ...rest,
    created_at: iso(row.created_at)!,
    updated_at: iso(row.updated_at)!,
    started_at: iso(row.started_at),
    finished_at: iso(row.finished_at),
  };
}

type Deps = {
  repo: Pick<DiscogsImportRepository, "create" | "get" | "listLatest" | "readLog">;
  kick: () => void;
};

export class DiscogsImportService {
  constructor(private deps: Deps) {}

  /** The username an import runs for: the one given, else `DISCOGS_USERNAME`. */
  resolveUsername(username?: string | null): string | null {
    return username?.trim() || process.env.DISCOGS_USERNAME?.trim() || null;
  }

  /**
   * Queue an import, or return the one already active for that username.
   * Throws `DiscogsCredentialsMissingError` without a token or a username.
   */
  async start(username?: string | null): Promise<{ import: DiscogsImport; created: boolean }> {
    const resolved = this.resolveUsername(username);
    if (!process.env.DISCOGS_USER_TOKEN?.trim() || !resolved) {
      throw new DiscogsCredentialsMissingError();
    }
    const { row, created } = await this.deps.repo.create(resolved);
    this.deps.kick();
    return { import: toDiscogsImport(row), created };
  }

  async get(id: number): Promise<DiscogsImport | null> {
    const row = await this.deps.repo.get(id);
    return row ? toDiscogsImport(row) : null;
  }

  async list(activeOnly: boolean): Promise<DiscogsImport[]> {
    const rows = await this.deps.repo.listLatest({ activeOnly });
    return rows.map(toDiscogsImport);
  }

  async readLog(id: number, after: number, limit: number) {
    const lines = await this.deps.repo.readLog(id, after, limit);
    return { lines, next_after: lines.length > 0 ? lines[lines.length - 1].id : after };
  }
}

export const discogsImportService = new DiscogsImportService({
  repo: discogsImportRepository,
  kick: kickDiscogsImportWorker,
});
