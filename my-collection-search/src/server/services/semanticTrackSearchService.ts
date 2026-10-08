import { withDbTransaction } from "@/lib/serverDb";
import { getServingModel } from "@/lib/embeddings/config";
import { embeddingsRepository } from "@/server/repositories/embeddingsRepository";
import { embedSearchQuery, normalizeQuery } from "@/server/services/queryEmbeddingService";
import type { TrackAttributeFilters, TrackMissingFilter } from "@/lib/trackFilterSpec";
import { hasVectorsSelectSql, trackGenresSelectSql } from "@/server/repositories/trackGenreRepository";

/**
 * Natural-language track search (#409): the `context` embedding (#408)
 * queried with the user's words, and its fusion with lexical search.
 */

/** Semantic and hybrid return one page; there is no offset past the pool. */
export const SEMANTIC_MAX_LIMIT = 50;
/** How many results each leg contributes to a hybrid fusion. */
export const HYBRID_LEG_SIZE = 50;
/**
 * At most this many tracks from one release. Descriptive text is mostly
 * album-level, so without a cap one album fills the page. #424 measured the
 * cost on the frozen queries: 3 beat 2 on 10 queries and lost none (P@10
 * 0.854 vs 0.800), at about 5 releases per top 10 instead of 6. No cap
 * (0.900) wasn't reliably better than 3, and showed about 3 releases.
 */
export const PER_RELEASE_CAP = 3;
/** The usual reciprocal rank fusion constant. */
export const RRF_K = 60;
/**
 * ivfflat probes for the context index (`lists = 100`). The default of 1
 * searches a hundredth of the vectors; iterative scans then keep probing
 * when filters leave too few rows.
 */
export const CONTEXT_IVFFLAT_PROBES = 10;

export type TrackRow = Record<string, unknown> & { track_id: string; friend_id: number };

export type SemanticSearchResult = {
  hits: TrackRow[];
  cacheHit: boolean;
  embedMs: number;
  vectorMs: number;
};

const trackKey = (row: { track_id: string; friend_id: number }) =>
  `${row.track_id}:${Number(row.friend_id)}`;

export async function semanticTrackSearch(params: {
  q: string;
  limit: number;
  friendId?: number;
  missing: TrackMissingFilter[];
  /** BPM, key and rating (#412), applied inside the vector scan. */
  attributes?: TrackAttributeFilters;
  caller: string;
}): Promise<SemanticSearchResult> {
  const { model, dims, templateVersion } = await getServingModel("context");

  const embedStartedAt = Date.now();
  const { embedding, cacheHit } = await embedSearchQuery({
    query: params.q,
    model,
    dims,
    caller: params.caller,
  });
  const embedMs = Date.now() - embedStartedAt;

  const vectorStartedAt = Date.now();
  const hits = await withDbTransaction(async (client) => {
    // Transaction-local, so a pooled connection never carries them onward.
    await client.query(
      `SELECT set_config('ivfflat.probes', $1, true),
              set_config('ivfflat.iterative_scan', 'relaxed_order', true)`,
      [String(CONTEXT_IVFFLAT_PROBES)]
    );
    const matches = await embeddingsRepository.findContextMatches(client, {
      queryEmbedding: embedding,
      model,
      templateVersion,
      dims,
      limit: params.limit,
      perReleaseCap: PER_RELEASE_CAP,
      filters: { ...params.attributes, friendId: params.friendId, missing: params.missing },
    });
    if (matches.length === 0) return [];

    // The same row shape lexical search returns, so clients see one contract.
    const { rows } = await client.query<TrackRow>(
      `
      SELECT t.*
        , ${hasVectorsSelectSql("t")}
        , ${trackGenresSelectSql("t")}
      FROM tracks t
      JOIN unnest($1::text[], $2::int[]) AS m(track_id, friend_id)
        ON t.track_id = m.track_id AND t.friend_id = m.friend_id
      WHERE t.deleted_at IS NULL
      `,
      [matches.map((m) => m.track_id), matches.map((m) => m.friend_id)]
    );
    const byKey = new Map(rows.map((row) => [trackKey(row), row]));
    return matches.flatMap((match) => byKey.get(trackKey(match)) ?? []);
  });

  return { hits, cacheHit, embedMs, vectorMs: Date.now() - vectorStartedAt };
}

/**
 * A lexical hit the user was plainly looking for: the query is its title,
 * artist or album, or its artist and title together. These lead a hybrid
 * result, in lexical order, so known-item searches never lose to a vibe.
 */
export function isKnownItemMatch(row: Record<string, unknown>, q: string): boolean {
  const query = normalizeQuery(q);
  if (!query) return false;
  const field = (name: string) =>
    typeof row[name] === "string" ? normalizeQuery(row[name] as string) : "";
  const title = field("title");
  const artist = field("artist");
  const candidates = [
    title,
    artist,
    field("album"),
    `${artist} ${title}`,
    `${title} ${artist}`,
    `${artist} - ${title}`,
  ];
  return candidates.some((candidate) => candidate.length > 0 && candidate === query);
}

/**
 * Reciprocal rank fusion of the lexical and semantic lists, after the
 * known-item matches. Ties keep lexical order first.
 */
export function fuseHybridResults<T extends TrackRow>(params: {
  q: string;
  lexical: T[];
  semantic: T[];
  limit: number;
}): T[] {
  const { q, lexical, semantic, limit } = params;
  const pinned = lexical.filter((row) => isKnownItemMatch(row, q));
  const pinnedKeys = new Set(pinned.map(trackKey));

  const scores = new Map<string, { row: T; score: number; order: number }>();
  let order = 0;
  for (const list of [lexical, semantic]) {
    list.forEach((row, index) => {
      const key = trackKey(row);
      if (pinnedKeys.has(key)) return;
      const entry = scores.get(key) ?? { row, score: 0, order: order++ };
      entry.score += 1 / (RRF_K + index + 1);
      scores.set(key, entry);
    });
  }

  // Lexical rows aren't release-capped the way the vector leg is, so cap the
  // fused tail too. Known-item matches are exempt: an album search wants the album.
  const perRelease = new Map<string, number>();
  const fused = [...scores.values()]
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((entry) => entry.row)
    .filter((row) => {
      const release = `${Number(row.friend_id)}:${row.release_id ?? `track:${row.track_id}`}`;
      const seen = perRelease.get(release) ?? 0;
      perRelease.set(release, seen + 1);
      return seen < PER_RELEASE_CAP;
    });
  return [...pinned, ...fused].slice(0, limit);
}
