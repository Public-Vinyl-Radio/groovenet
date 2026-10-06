import type { PoolClient } from "pg";
import { dbQuery } from "@/lib/serverDb";
import type { LocalTagTrack } from "@/lib/genres/localTags";

export type ProposalAction = "map" | "new_genre" | "descriptor" | "drop";
export type ProposalMethod = "exact" | "ai" | "manual";
export type ProposalStatus = "pending" | "accepted" | "rejected" | "edited";
export type RunStatus = "running" | "completed" | "failed";

export type ReconciliationRunOptions = {
  ai: boolean;
  new_genre_min_tracks: number;
  /** Most values sent to the model in this run; null for no cap. */
  limit: number | null;
  /** Re-ask the model for values whose pending proposal came from it. */
  refresh: boolean;
  /** Only this friend's tracks; null for every friend. */
  friend_id: number | null;
};

export type ReconciliationRun = {
  id: string;
  status: RunStatus;
  options: ReconciliationRunOptions;
  model: string | null;
  distinct_values: number;
  exact_matches: number;
  kept: number;
  ai_pending: number;
  ai_proposed: number;
  ai_failed: number;
  ai_batches: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  error: string | null;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
};

export type RunCounters = Partial<
  Pick<
    ReconciliationRun,
    | "distinct_values" | "exact_matches" | "kept" | "ai_pending" | "ai_proposed"
    | "ai_failed" | "ai_batches" | "input_tokens" | "output_tokens" | "cost_usd"
  >
>;

export type ProposalGenre = { id: string; name: string; parent_name: string | null };

export type Proposal = {
  id: string;
  value_normalized: string;
  raw_examples: string[];
  track_count: number;
  action: ProposalAction;
  target_genre_ids: string[];
  target_genres: ProposalGenre[];
  proposed_genre_name: string | null;
  proposed_parent_id: string | null;
  proposed_parent_name: string | null;
  confidence: number | null;
  method: ProposalMethod;
  status: ProposalStatus;
  run_id: string | null;
  created_genre_id: string | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
};

/** What a run writes for one value. Review fields are never part of it. */
export type ProposalDraft = {
  value_normalized: string;
  raw_examples: string[];
  track_count: number;
  action: ProposalAction;
  target_genre_ids: string[];
  proposed_genre_name: string | null;
  proposed_parent_id: string | null;
  confidence: number | null;
  method: ProposalMethod;
};

export type ProposalStats = Pick<ProposalDraft, "value_normalized" | "raw_examples" | "track_count">;

export type ProposalFilter = {
  status?: ProposalStatus;
  action?: ProposalAction;
  method?: ProposalMethod;
  limit: number;
  offset: number;
};

export type ProposalPatch = Partial<
  Pick<Proposal, "status" | "action" | "target_genre_ids" | "proposed_genre_name" | "proposed_parent_id">
> & { method?: ProposalMethod };

export type TaxonomyEntry = { id: string; name: string; normalized_name: string; parent_name: string | null };

const RUN_COLUMNS = `
  id, status, options, model, distinct_values, exact_matches, kept, ai_pending,
  ai_proposed, ai_failed, ai_batches, input_tokens, output_tokens,
  cost_usd::float8 AS cost_usd, error, started_at, updated_at, finished_at`;

const PROPOSAL_SELECT = `
  SELECT
    p.id, p.value_normalized, p.raw_examples, p.track_count, p.action,
    p.target_genre_ids::text[] AS target_genre_ids,
    COALESCE((
      SELECT json_agg(json_build_object('id', g.id, 'name', g.name, 'parent_name', gp.name) ORDER BY t.ord)
      FROM unnest(p.target_genre_ids) WITH ORDINALITY AS t(genre_id, ord)
      JOIN genres g ON g.id = t.genre_id
      LEFT JOIN genres gp ON gp.id = g.parent_id
    ), '[]'::json) AS target_genres,
    p.proposed_genre_name, p.proposed_parent_id, pp.name AS proposed_parent_name,
    p.confidence, p.method, p.status, p.run_id, p.created_genre_id, p.applied_at,
    p.created_at, p.updated_at
  FROM genre_reconciliation_proposals p
  LEFT JOIN genres pp ON pp.id = p.proposed_parent_id`;

export class GenreReconciliationRepository {
  /**
   * Every live track with `local_tags` (one friend's, or everyone's), with its
   * album's styles as AI context (the album's Discogs styles, falling back to
   * the track's own copy, then genres when there are no styles at all).
   */
  async listLocalTagTracks(client?: PoolClient, friendId: number | null = null): Promise<LocalTagTrack[]> {
    const sql = `
      SELECT t.track_id, t.friend_id, t.local_tags,
        COALESCE(NULLIF(a.styles, '{}'), NULLIF(t.styles, '{}'), NULLIF(a.genres, '{}'), t.genres, '{}') AS styles
      FROM tracks t
      LEFT JOIN albums a ON a.release_id = t.release_id AND a.friend_id = t.friend_id
      WHERE t.deleted_at IS NULL AND NULLIF(btrim(t.local_tags), '') IS NOT NULL
        AND ($1::integer IS NULL OR t.friend_id = $1)`;
    const { rows } = client
      ? await client.query<LocalTagTrack>(sql, [friendId])
      : await dbQuery<LocalTagTrack>(sql, [friendId]);
    return rows;
  }

  async listTaxonomy(): Promise<TaxonomyEntry[]> {
    const { rows } = await dbQuery<TaxonomyEntry>(`
      SELECT g.id, g.name, g.normalized_name, gp.name AS parent_name
      FROM genres g LEFT JOIN genres gp ON gp.id = g.parent_id
      ORDER BY COALESCE(gp.name, g.name), gp.name NULLS FIRST, g.name`);
    return rows;
  }

  /**
   * Values (already normalised) that are a taxonomy name or alias, with the
   * genre each resolves to. A canonical name wins over an alias spelled the
   * same way, as in trackGenreRepository.resolveGenreRefs.
   */
  async resolveExactValues(values: string[]): Promise<Map<string, string>> {
    const { rows } = await dbQuery<{ value: string; genre_id: string }>(
      `SELECT v.value, COALESCE(g.id, a.genre_id)::text AS genre_id
       FROM unnest($1::text[]) AS v(value)
       LEFT JOIN genres g ON g.normalized_name = v.value
       LEFT JOIN genre_aliases a ON a.alias_normalized = v.value
       WHERE g.id IS NOT NULL OR a.genre_id IS NOT NULL`,
      [values]
    );
    return new Map(rows.map((row) => [row.value, row.genre_id]));
  }

  async listProposalStates():Promise<Map<string, { status: ProposalStatus; method: ProposalMethod; action: ProposalAction }>> {
    const { rows } = await dbQuery<{ value_normalized: string; status: ProposalStatus; method: ProposalMethod; action: ProposalAction }>(
      "SELECT value_normalized, status, method, action FROM genre_reconciliation_proposals"
    );
    return new Map(rows.map(({ value_normalized, ...state }) => [value_normalized, state]));
  }

  /**
   * Writes a run's proposals. A value already reviewed (anything but
   * `pending`) keeps its decision; only its statistics are refreshed.
   */
  async upsertProposals(drafts: ProposalDraft[], runId: string): Promise<void> {
    if (drafts.length === 0) return;
    await dbQuery(
      `
      INSERT INTO genre_reconciliation_proposals AS p (
        value_normalized, raw_examples, track_count, action, target_genre_ids,
        proposed_genre_name, proposed_parent_id, confidence, method, run_id
      )
      SELECT d.value_normalized, d.raw_examples, d.track_count, d.action,
        d.target_genre_ids, d.proposed_genre_name, d.proposed_parent_id,
        d.confidence, d.method, $2::uuid
      FROM jsonb_to_recordset($1::jsonb) AS d(
        value_normalized text, raw_examples text[], track_count integer, action text,
        target_genre_ids uuid[], proposed_genre_name text, proposed_parent_id uuid,
        confidence real, method text
      )
      ON CONFLICT (value_normalized) DO UPDATE SET
        raw_examples = EXCLUDED.raw_examples,
        track_count = EXCLUDED.track_count,
        action = CASE WHEN p.status = 'pending' THEN EXCLUDED.action ELSE p.action END,
        target_genre_ids = CASE WHEN p.status = 'pending' THEN EXCLUDED.target_genre_ids ELSE p.target_genre_ids END,
        proposed_genre_name = CASE WHEN p.status = 'pending' THEN EXCLUDED.proposed_genre_name ELSE p.proposed_genre_name END,
        proposed_parent_id = CASE WHEN p.status = 'pending' THEN EXCLUDED.proposed_parent_id ELSE p.proposed_parent_id END,
        confidence = CASE WHEN p.status = 'pending' THEN EXCLUDED.confidence ELSE p.confidence END,
        method = CASE WHEN p.status = 'pending' THEN EXCLUDED.method ELSE p.method END,
        run_id = CASE WHEN p.status = 'pending' THEN EXCLUDED.run_id ELSE p.run_id END,
        updated_at = now()
      `,
      [JSON.stringify(drafts), runId]
    );
  }

  /**
   * Refreshes examples and counts for values a run did not re-propose, and
   * zeroes the count of values no track in the run's scope uses. Counts so
   * always describe the latest run's scope: after a one-friend run, another
   * friend's values read 0 until a run that includes them.
   */
  async refreshProposalStats(stats: ProposalStats[]): Promise<void> {
    await dbQuery(
      `
      UPDATE genre_reconciliation_proposals p
      SET raw_examples = COALESCE(s.raw_examples, p.raw_examples),
          track_count = COALESCE(s.track_count, 0)
      FROM genre_reconciliation_proposals p2
      LEFT JOIN jsonb_to_recordset($1::jsonb)
        AS s(value_normalized text, raw_examples text[], track_count integer)
        ON s.value_normalized = p2.value_normalized
      WHERE p.id = p2.id
      `,
      [JSON.stringify(stats)]
    );
  }

  /** Writes off runs whose process stopped reporting, so a new one can start. */
  async failStaleRuns(staleMinutes: number): Promise<void> {
    await dbQuery(
      `UPDATE genre_reconciliation_runs
       SET status = 'failed', error = 'Stalled: no progress reported', finished_at = now()
       WHERE status = 'running' AND updated_at < now() - make_interval(mins => $1)`,
      [staleMinutes]
    );
  }

  /** Starts a run, or returns null when one is already running. */
  async createRun(options: ReconciliationRunOptions, model: string | null): Promise<ReconciliationRun | null> {
    const { rows } = await dbQuery<ReconciliationRun>(
      `INSERT INTO genre_reconciliation_runs (options, model) VALUES ($1::jsonb, $2)
       ON CONFLICT (status) WHERE status = 'running' DO NOTHING
       RETURNING ${RUN_COLUMNS}`,
      [JSON.stringify(options), model]
    );
    return rows[0] ?? null;
  }

  async getRunningRun(): Promise<ReconciliationRun | null> {
    const { rows } = await dbQuery<ReconciliationRun>(
      `SELECT ${RUN_COLUMNS} FROM genre_reconciliation_runs WHERE status = 'running'`
    );
    return rows[0] ?? null;
  }

  async getRun(id: string): Promise<ReconciliationRun | null> {
    const { rows } = await dbQuery<ReconciliationRun>(
      `SELECT ${RUN_COLUMNS} FROM genre_reconciliation_runs WHERE id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }

  /** Sets counters outright, and bumps `updated_at` as the run's heartbeat. */
  async updateRun(id: string, counters: RunCounters): Promise<void> {
    const entries = Object.entries(counters).filter(([, value]) => value !== undefined);
    const sets = entries.map(([column], i) => `${column} = $${i + 2}`);
    await dbQuery(
      `UPDATE genre_reconciliation_runs SET ${[...sets, "updated_at = now()"].join(", ")} WHERE id = $1`,
      [id, ...entries.map(([, value]) => value)]
    );
  }

  async finishRun(id: string, status: Exclude<RunStatus, "running">, error: string | null = null): Promise<void> {
    await dbQuery(
      `UPDATE genre_reconciliation_runs
       SET status = $2, error = $3, finished_at = now(), updated_at = now()
       WHERE id = $1`,
      [id, status, error]
    );
  }

  async listProposals(filter: ProposalFilter): Promise<{ proposals: Proposal[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    for (const column of ["status", "action", "method"] as const) {
      if (filter[column] === undefined) continue;
      params.push(filter[column]);
      conditions.push(`p.${column} = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const [{ rows }, count] = await Promise.all([
      dbQuery<Proposal>(
        `${PROPOSAL_SELECT} ${where}
         ORDER BY p.track_count DESC, p.value_normalized
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, filter.limit, filter.offset]
      ),
      dbQuery<{ total: number }>(
        `SELECT COUNT(*)::integer AS total FROM genre_reconciliation_proposals p ${where}`,
        params
      ),
    ]);
    return { proposals: rows, total: count.rows[0].total };
  }

  async getProposal(id: string): Promise<Proposal | null> {
    const { rows } = await dbQuery<Proposal>(`${PROPOSAL_SELECT} WHERE p.id = $1`, [id]);
    return rows[0] ?? null;
  }

  async updateProposal(id: string, patch: ProposalPatch): Promise<boolean> {
    const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
    const sets = entries.map(([column], i) =>
      column === "target_genre_ids" ? `${column} = $${i + 2}::uuid[]` : `${column} = $${i + 2}`
    );
    const { rowCount } = await dbQuery(
      `UPDATE genre_reconciliation_proposals SET ${[...sets, "updated_at = now()"].join(", ")} WHERE id = $1`,
      [id, ...entries.map(([, value]) => value)]
    );
    return (rowCount ?? 0) > 0;
  }

  /** Accepted or edited proposals to apply: all of them, or just `ids`. */
  async listApprovedProposals(client: PoolClient, ids?: string[]): Promise<Proposal[]> {
    const { rows } = await client.query<Proposal>(
      `${PROPOSAL_SELECT}
       WHERE p.status IN ('accepted', 'edited') AND ($1::uuid[] IS NULL OR p.id = ANY($1::uuid[]))
       ORDER BY p.track_count DESC, p.value_normalized
       FOR UPDATE OF p`,
      [ids ?? null]
    );
    return rows;
  }

  /** Tracks with a taxonomy link, and tracks with descriptors (one friend's, or everyone's). */
  async listTrackGenreState(friendId: number | null = null): Promise<{ linked: Set<string>; described: Set<string> }> {
    const [linked, described] = await Promise.all([
      dbQuery<{ key: string }>(
        `SELECT DISTINCT track_id || ':' || friend_id AS key FROM track_genres
         WHERE $1::integer IS NULL OR friend_id = $1`,
        [friendId]
      ),
      dbQuery<{ key: string }>(
        `SELECT track_id || ':' || friend_id AS key FROM tracks
         WHERE cardinality(descriptors) > 0 AND ($1::integer IS NULL OR friend_id = $1)`,
        [friendId]
      ),
    ]);
    return {
      linked: new Set(linked.rows.map((row) => row.key)),
      described: new Set(described.rows.map((row) => row.key)),
    };
  }
}

export const genreReconciliationRepository = new GenreReconciliationRepository();
