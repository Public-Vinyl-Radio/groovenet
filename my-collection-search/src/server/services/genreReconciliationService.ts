import type { PoolClient } from "pg";
import { withDbTransaction } from "@/lib/serverDb";
import { normalizeGenreName } from "@/lib/genres/normalization";
import { collectLocalTagValues, localTagValues, type LocalTagValue } from "@/lib/genres/localTags";
import {
  genreReconciliationRepository as repo,
  type Proposal,
  type ProposalAction,
  type ProposalDraft,
  type ProposalPatch,
  type ProposalStatus,
  type ReconciliationRun,
  type ReconciliationRunOptions,
} from "@/server/repositories/genreReconciliationRepository";
import { trackGenreRepository } from "@/server/repositories/trackGenreRepository";
import {
  RECONCILIATION_BATCH_SIZE,
  RECONCILIATION_MODEL,
  mapValuesWithAi,
  type AiUsage,
} from "@/server/genres/reconciliationAi";

/**
 * Reconciles free-text `local_tags` onto the genre taxonomy (#372).
 *
 *   run    split → normalise → exact match → batched AI → proposals (pending)
 *   review PATCH a proposal: accept, reject, or edit it
 *   apply  accepted proposals → track_genres + descriptors + genre_aliases
 *
 * `local_tags` is never written, and every link carries
 * `source = 'reconciliation'`, so an apply can be undone.
 */

/** A run that has not reported in this long is presumed dead. */
const STALE_RUN_MINUTES = 15;

export class GenreReconciliationError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409 | 503,
    public readonly run?: ReconciliationRun
  ) {
    super(message);
  }
}

export const defaultRunOptions: ReconciliationRunOptions = {
  ai: true,
  new_genre_min_tracks: 10,
  limit: null,
  refresh: false,
  friend_id: null,
};

/** Statuses a run leaves alone: a person has decided. */
const REVIEWED: ProposalStatus[] = ["accepted", "edited", "rejected"];

export type RunPlan = {
  exact: ProposalDraft[];
  kept: LocalTagValue[];
  forAi: LocalTagValue[];
};

/**
 * Decides, per value, whether a run proposes it by exact match, sends it to
 * the model, or keeps its current proposal. Pure, so the re-run rules are
 * testable without a database.
 *
 * - Reviewed values keep their decision.
 * - An exact match always wins over a pending proposal; aliases added since the
 *   last run are how the backlog shrinks.
 * - A pending AI or manual proposal is kept unless `refresh`, so a re-run does
 *   not pay for the same answer twice.
 */
export function planRun(
  values: LocalTagValue[],
  existing: Map<string, { status: ProposalStatus; method: string }>,
  exactIds: Map<string, string>,
  options: Pick<ReconciliationRunOptions, "refresh">
): RunPlan {
  const plan: RunPlan = { exact: [], kept: [], forAi: [] };
  for (const value of values) {
    const current = existing.get(value.value_normalized);
    if (current && REVIEWED.includes(current.status)) {
      plan.kept.push(value);
      continue;
    }
    const exactId = exactIds.get(value.value_normalized);
    if (exactId) {
      plan.exact.push({
        value_normalized: value.value_normalized,
        raw_examples: value.raw_examples,
        track_count: value.track_count,
        action: "map",
        target_genre_ids: [exactId],
        proposed_genre_name: null,
        proposed_parent_id: null,
        confidence: 1,
        method: "exact",
      });
    } else if (current && current.method !== "exact" && !options.refresh) {
      plan.kept.push(value);
    } else {
      plan.forAi.push(value);
    }
  }
  return plan;
}

export async function startRun(input: Partial<ReconciliationRunOptions>): Promise<ReconciliationRun> {
  const options = { ...defaultRunOptions, ...input };
  if (options.ai && !process.env.OPENAI_API_KEY) {
    throw new GenreReconciliationError("OPENAI_API_KEY is not set; run with ai: false for exact matches only", 503);
  }
  await repo.failStaleRuns(STALE_RUN_MINUTES);
  const run = await repo.createRun(options, options.ai ? RECONCILIATION_MODEL : null);
  if (!run) {
    const running = await repo.getRunningRun();
    throw new GenreReconciliationError("A reconciliation run is already in progress", 409, running ?? undefined);
  }
  // Not awaited: the caller polls the run. A crash mid-run leaves it
  // `running` until the stale check above writes it off.
  void executeRun(run.id, options);
  return run;
}

export async function executeRun(runId: string, options: ReconciliationRunOptions): Promise<void> {
  try {
    const values = collectLocalTagValues(await repo.listLocalTagTracks(undefined, options.friend_id));
    const existing = await repo.listProposalStates();
    const exactIds = await repo.resolveExactValues(values.map((value) => value.value_normalized));
    const plan = planRun(values, existing, exactIds, options);
    await repo.refreshProposalStats(values);
    await repo.upsertProposals(plan.exact, runId);

    const toSend = options.ai ? plan.forAi.slice(0, options.limit ?? undefined) : [];
    const counters = {
      distinct_values: values.length,
      exact_matches: plan.exact.length,
      kept: plan.kept.length,
      ai_pending: plan.forAi.length - toSend.length,
      ai_proposed: 0,
      ai_failed: 0,
      ai_batches: 0,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
    };
    await repo.updateRun(runId, counters);

    let lastError: string | null = null;
    if (toSend.length > 0) {
      const taxonomy = await repo.listTaxonomy();
      for (let i = 0; i < toSend.length; i += RECONCILIATION_BATCH_SIZE) {
        const batch = toSend.slice(i, i + RECONCILIATION_BATCH_SIZE);
        try {
          const { drafts, usage } = await mapValuesWithAi(batch, taxonomy, options.new_genre_min_tracks);
          await repo.upsertProposals(drafts, runId);
          addUsage(counters, usage);
          counters.ai_proposed += drafts.length;
          counters.ai_failed += batch.length - drafts.length;
        } catch (error) {
          const usage = (error as { usage?: AiUsage }).usage;
          if (usage) addUsage(counters, usage);
          counters.ai_failed += batch.length;
          lastError = error instanceof Error ? error.message : String(error);
          console.error(`[genre-reconciliation] run ${runId} batch ${counters.ai_batches + 1} failed:`, error);
        }
        counters.ai_batches += 1;
        await repo.updateRun(runId, counters);
      }
    }

    await repo.finishRun(runId, "completed", lastError);
    console.log(
      `[genre-reconciliation] run ${runId} completed: ${counters.distinct_values} values, ` +
        `${counters.exact_matches} exact, ${counters.ai_proposed} AI-proposed, ${counters.ai_failed} AI-failed, ` +
        `${counters.kept} kept, ${counters.ai_pending} unsent; ${counters.ai_batches} batches, ` +
        `${counters.input_tokens}+${counters.output_tokens} tokens, $${counters.cost_usd.toFixed(4)}`
    );
  } catch (error) {
    console.error(`[genre-reconciliation] run ${runId} failed:`, error);
    try {
      await repo.finishRun(runId, "failed", error instanceof Error ? error.message : String(error));
    } catch (finishError) {
      // The stale-run check writes it off later.
      console.error("[genre-reconciliation] could not record failure:", finishError);
    }
  }
}

function addUsage(counters: { input_tokens: number; output_tokens: number; cost_usd: number }, usage: AiUsage) {
  counters.input_tokens += usage.input_tokens;
  counters.output_tokens += usage.output_tokens;
  counters.cost_usd += usage.cost_usd;
}

export async function getRun(id: string): Promise<ReconciliationRun> {
  const run = await repo.getRun(id);
  if (!run) throw new GenreReconciliationError("Reconciliation run not found", 404);
  return run;
}

export type ProposalUpdate = {
  status?: ProposalStatus;
  action?: ProposalAction;
  /** Genre ids, or names resolved through the taxonomy. */
  target_genres?: string[];
  proposed_genre_name?: string | null;
  proposed_parent_id?: string | null;
};

/**
 * Records a review decision. Changing what the proposal does marks it
 * `edited` (and `manual`), which apply treats like `accepted`.
 */
export async function updateProposal(id: string, input: ProposalUpdate): Promise<Proposal> {
  const current = await repo.getProposal(id);
  if (!current) throw new GenreReconciliationError("Proposal not found", 404);

  const patch: ProposalPatch = {};
  if (input.target_genres !== undefined) {
    const { ids, unknown } = await trackGenreRepository.resolveGenreRefs(input.target_genres);
    if (unknown.length) throw new GenreReconciliationError(`Unknown genres: ${unknown.join(", ")}`, 400);
    patch.target_genre_ids = ids;
  }
  if (input.action !== undefined) patch.action = input.action;
  if (input.proposed_genre_name !== undefined) patch.proposed_genre_name = input.proposed_genre_name?.trim() || null;
  if (input.proposed_parent_id !== undefined) patch.proposed_parent_id = input.proposed_parent_id;

  const edited = Object.keys(patch).length > 0;
  const action = patch.action ?? current.action;
  const targets = patch.target_genre_ids ?? current.target_genre_ids;
  const name = patch.proposed_genre_name !== undefined ? patch.proposed_genre_name : current.proposed_genre_name;
  const parent = patch.proposed_parent_id !== undefined ? patch.proposed_parent_id : current.proposed_parent_id;
  if (action === "map" && targets.length === 0) {
    throw new GenreReconciliationError("A map proposal needs at least one target genre", 400);
  }
  if (action === "new_genre" && (!name || !parent)) {
    throw new GenreReconciliationError("A new_genre proposal needs proposed_genre_name and proposed_parent_id", 400);
  }

  if (edited) {
    patch.method = "manual";
    patch.status = input.status === "rejected" || input.status === "pending" ? input.status : "edited";
  } else if (input.status !== undefined) {
    patch.status = input.status;
  }

  try {
    await repo.updateProposal(id, patch);
  } catch (error) {
    // proposed_parent_id is a foreign key: an unknown parent is the caller's.
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23503") {
      throw new GenreReconciliationError("proposed_parent_id is not a genre", 400);
    }
    throw error;
  }
  return (await repo.getProposal(id))!;
}

export type ApplySummary = {
  proposals_applied: number;
  tracks_linked: number;
  descriptors_added: number;
  aliases_added: number;
  genres_created: number;
  skipped: Array<{ id: string; value: string; reason: string }>;
};

const genreSlug = (name: string) =>
  name.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * Applies accepted and edited proposals, all of them or just `ids`, to every
 * friend's tracks or just `friendId`'s. Safe to repeat: links and aliases are
 * inserted with ON CONFLICT DO NOTHING and a created genre is reused, so a
 * second apply only picks up tracks tagged since. Links are added, never
 * replaced, so manual and enrichment genres survive. Aliases and created
 * genres are global whatever the scope, like the taxonomy.
 */
export async function applyProposals(ids?: string[], friendId: number | null = null): Promise<ApplySummary> {
  return withDbTransaction(async (client) => {
    // Same lock order as genreAdminService.mergeGenres, so the two serialise.
    await client.query("LOCK TABLE genres, genre_aliases IN SHARE ROW EXCLUSIVE MODE");
    await client.query("LOCK TABLE track_genres IN SHARE ROW EXCLUSIVE MODE");

    const proposals = await repo.listApprovedProposals(client, ids);
    const tracksByValue = new Map<string, Array<{ track_id: string; friend_id: number }>>();
    for (const track of await repo.listLocalTagTracks(client, friendId)) {
      for (const value of localTagValues(track.local_tags)) {
        const list = tracksByValue.get(value) ?? [];
        list.push({ track_id: track.track_id, friend_id: track.friend_id });
        tracksByValue.set(value, list);
      }
    }

    const summary: ApplySummary = {
      proposals_applied: 0, tracks_linked: 0, descriptors_added: 0,
      aliases_added: 0, genres_created: 0, skipped: [],
    };
    for (const proposal of proposals) {
      const tracks = tracksByValue.get(proposal.value_normalized) ?? [];
      const outcome = await applyOne(client, proposal, tracks, summary);
      if (typeof outcome === "string") {
        summary.skipped.push({ id: proposal.id, value: proposal.value_normalized, reason: outcome });
        continue;
      }
      await client.query(
        "UPDATE genre_reconciliation_proposals SET applied_at = now(), created_genre_id = COALESCE($2, created_genre_id) WHERE id = $1",
        [proposal.id, outcome.createdGenreId]
      );
      summary.proposals_applied += 1;
    }
    return summary;
  });
}

/** Applies one proposal, or returns why it could not be. */
async function applyOne(
  client: PoolClient,
  proposal: Proposal,
  tracks: Array<{ track_id: string; friend_id: number }>,
  summary: ApplySummary
): Promise<{ createdGenreId: string | null } | string> {
  const trackIds = tracks.map((t) => t.track_id);
  const friendIds = tracks.map((t) => t.friend_id);

  if (proposal.action === "drop") return { createdGenreId: null };

  if (proposal.action === "descriptor") {
    const descriptor = normalizeGenreName(proposal.value_normalized);
    const { rowCount } = await client.query(
      `UPDATE tracks t SET descriptors = array_append(t.descriptors, $3)
       FROM unnest($1::text[], $2::int[]) AS x(track_id, friend_id)
       WHERE t.track_id = x.track_id AND t.friend_id = x.friend_id AND NOT ($3 = ANY(t.descriptors))`,
      [trackIds, friendIds, descriptor]
    );
    summary.descriptors_added += rowCount ?? 0;
    return { createdGenreId: null };
  }

  let genreIds: string[];
  let createdGenreId: string | null = null;
  if (proposal.action === "map") {
    // target_genres only lists ids that still exist; a merged-away or deleted
    // target simply drops out.
    genreIds = proposal.target_genres.map((g) => g.id);
    if (genreIds.length === 0) return "none of its target genres exist any more";
  } else {
    const found = await findOrCreateGenre(client, proposal);
    if (typeof found === "string") return found;
    genreIds = [found.id];
    if (found.created) {
      createdGenreId = found.id;
      summary.genres_created += 1;
    }
  }

  if (tracks.length > 0) {
    const { rowCount } = await client.query(
      `INSERT INTO track_genres (track_id, friend_id, genre_id, source)
       SELECT x.track_id, x.friend_id, g.genre_id, 'reconciliation'
       FROM unnest($1::text[], $2::int[]) AS x(track_id, friend_id)
       CROSS JOIN unnest($3::uuid[]) AS g(genre_id)
       ON CONFLICT DO NOTHING`,
      [trackIds, friendIds, genreIds]
    );
    summary.tracks_linked += rowCount ?? 0;
  }

  // An alias only makes sense for a one-to-one mapping, and never shadows a
  // canonical name (exact matches are already names or aliases).
  if (genreIds.length === 1) {
    const { rowCount } = await client.query(
      `INSERT INTO genre_aliases (alias_normalized, genre_id, source)
       SELECT $1, $2, 'reconciliation'
       WHERE NOT EXISTS (SELECT 1 FROM genres WHERE normalized_name = $1)
       ON CONFLICT (alias_normalized) DO NOTHING`,
      [proposal.value_normalized, genreIds[0]]
    );
    summary.aliases_added += rowCount ?? 0;
  }
  return { createdGenreId };
}

async function findOrCreateGenre(
  client: PoolClient,
  proposal: Proposal
): Promise<{ id: string; created: boolean } | string> {
  if (proposal.created_genre_id) {
    const { rows } = await client.query("SELECT id FROM genres WHERE id = $1", [proposal.created_genre_id]);
    if (rows.length) return { id: rows[0].id, created: false };
  }
  const name = proposal.proposed_genre_name?.trim();
  if (!name) return "new_genre without a proposed_genre_name";
  const normalized = normalizeGenreName(name);
  const { rows: existing } = await client.query<{ id: string }>(
    `SELECT id FROM genres WHERE normalized_name = $1
     UNION ALL SELECT genre_id FROM genre_aliases WHERE alias_normalized = $1
     LIMIT 1`,
    [normalized]
  );
  if (existing.length) return { id: existing[0].id, created: false };
  if (!proposal.proposed_parent_id) return "new_genre without an existing parent";
  const slug = genreSlug(name);
  if (!slug) return `'${name}' does not produce a URL slug`;
  const { rows: clash } = await client.query("SELECT 1 FROM genres WHERE slug = $1", [slug]);
  if (clash.length) return `slug '${slug}' is already taken`;
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO genres (name, normalized_name, slug, parent_id, source)
     VALUES ($1, $2, $3, $4, 'custom') RETURNING id`,
    [name, normalized, slug, proposal.proposed_parent_id]
  );
  return { id: rows[0].id, created: true };
}

export type Coverage = {
  tracks: {
    with_local_tags: number;
    with_genres: number;
    descriptors_only: number;
    no_genre: number;
    unresolved: number;
  };
  values: {
    distinct: number;
    proposed: number;
    exact: number;
    exact_share: number;
    by_status: Record<ProposalStatus, number>;
    by_action: Record<ProposalAction, number>;
  };
};

/**
 * How far reconciliation has got, for one friend or everyone. Every track
 * with `local_tags` lands in one bucket: it has a taxonomy genre; failing
 * that, descriptors; failing that, every one of its values was reviewed as
 * `drop` (explicitly no genre); or it is still unresolved.
 */
export async function getCoverage(friendId: number | null = null): Promise<Coverage> {
  const [tracks, { linked, described }, proposals] = await Promise.all([
    repo.listLocalTagTracks(undefined, friendId),
    repo.listTrackGenreState(friendId),
    repo.listProposalStates(),
  ]);

  const coverage: Coverage = {
    tracks: { with_local_tags: tracks.length, with_genres: 0, descriptors_only: 0, no_genre: 0, unresolved: 0 },
    values: {
      distinct: 0, proposed: 0, exact: 0, exact_share: 0,
      by_status: { pending: 0, accepted: 0, rejected: 0, edited: 0 },
      by_action: { map: 0, new_genre: 0, descriptor: 0, drop: 0 },
    },
  };

  const distinct = new Set<string>();
  for (const track of tracks) {
    const key = `${track.track_id}:${track.friend_id}`;
    const values = localTagValues(track.local_tags);
    values.forEach((value) => distinct.add(value));
    if (linked.has(key)) coverage.tracks.with_genres += 1;
    else if (described.has(key)) coverage.tracks.descriptors_only += 1;
    else if (
      values.length > 0 &&
      values.every((value) => {
        const p = proposals.get(value);
        return p && (p.status === "accepted" || p.status === "edited") && p.action === "drop";
      })
    ) coverage.tracks.no_genre += 1;
    else coverage.tracks.unresolved += 1;
  }

  coverage.values.distinct = distinct.size;
  for (const value of distinct) {
    const p = proposals.get(value);
    if (!p) continue;
    coverage.values.proposed += 1;
    coverage.values.by_status[p.status] += 1;
    coverage.values.by_action[p.action] += 1;
    if (p.method === "exact") coverage.values.exact += 1;
  }
  coverage.values.exact_share = distinct.size ? coverage.values.exact / distinct.size : 0;
  return coverage;
}
