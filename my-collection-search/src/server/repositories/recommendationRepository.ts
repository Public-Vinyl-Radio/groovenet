import type { PoolClient } from "pg";
import { withDbTransaction } from "@/lib/serverDb";
import { trackGenreIdsSelectSql } from "@/server/repositories/trackGenreRepository";

export type SeedTrackPair = {
  trackId: string;
  friendId: number;
};

export type RecommendationCandidateGenreRef = {
  id: string;
  parent_id: string | null;
};

export type RecommendationCandidateRow = {
  track_id: string;
  friend_id: number;
  distance: number;
  title: string;
  artist: string;
  album: string;
  year: string | null;
  bpm: number | null;
  key: string | null;
  genres: string[];
  styles: string[];
  /**
   * Free-text mood/genre descriptors (#368's baseline: spelling variants and
   * moods mixed together) — kept for the identity-search tag filter
   * (`fetchSimilarTracks`'s `tags` option), which matches mood words like
   * "warm" that have no taxonomy id. Genre-overlap scoring uses
   * `track_genre_ids` instead (#486), never this.
   */
  local_tags: string;
  track_genre_ids: RecommendationCandidateGenreRef[];
  danceability: number | null;
  mood_happy: number | null;
  mood_sad: number | null;
  mood_relaxed: number | null;
  mood_aggressive: number | null;
  star_rating: number | null;
  album_thumbnail: string | null;
};

type RecommendationCandidateRowRaw = Omit<RecommendationCandidateRow, "distance"> & {
  distance: string | number;
};

type SimilarityKind = "identity" | "audio_vibe";

type SimilarityParams = {
  model: string;
  templateVersion: number;
  dims: number;
  limit: number;
  ivfflatProbes: number;
  /**
   * Only candidates from this library. Omitted, every library is searched.
   * The seed may come from another library either way.
   */
  libraryFriendId?: number;
};

const CANDIDATE_COLUMNS = `
          t.track_id,
          t.friend_id,
          t.title,
          t.artist,
          t.album,
          t.year,
          t.bpm,
          t.key,
          t.genres,
          t.styles,
          t.local_tags,
          ${trackGenreIdsSelectSql("t")},
          t.danceability,
          t.mood_happy,
          t.mood_sad,
          t.mood_relaxed,
          t.mood_aggressive,
          t.star_rating,
          t.album_thumbnail`;

function buildSeedValues(seedTracks: SeedTrackPair[]): {
  valuesClause: string;
  params: Array<string | number>;
  limitParamIndex: number;
} {
  const params: Array<string | number> = [];
  const tuples: string[] = [];

  for (let i = 0; i < seedTracks.length; i += 1) {
    const offset = i * 2;
    tuples.push(`($${offset + 1}::text, $${offset + 2}::integer)`);
    params.push(seedTracks[i].trackId, seedTracks[i].friendId);
  }

  return {
    valuesClause: tuples.join(", "),
    params,
    limitParamIndex: seedTracks.length * 2 + 1,
  };
}

function normalizeRows(rows: RecommendationCandidateRowRaw[]): RecommendationCandidateRow[] {
  return rows.map((row) => ({ ...row, distance: Number(row.distance) }));
}

/**
 * `dims` can't be bound as a query parameter (a type modifier must be a
 * literal at parse time), so it's interpolated directly — safe here because
 * every caller sources it from `embedding_model_settings`, never from
 * request input. See `embeddingsRepository.castVector` for the matching
 * partial-index rationale.
 */
function castVector(column: string, dims: number): string {
  if (!Number.isInteger(dims) || dims <= 0) {
    throw new Error(`Invalid vector dims: ${dims}`);
  }
  return `(${column}::vector(${dims}))`;
}

/**
 * Run a similarity query with its ivfflat settings scoped to one transaction,
 * so a pooled connection never carries them onward. The iterative scan keeps
 * probing when the library filter leaves fewer rows than the limit; its
 * relaxed order is why every query re-sorts by distance on the way out.
 */
async function withVectorScan<T>(
  ivfflatProbes: number,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  return withDbTransaction(async (client) => {
    await client.query(
      `SELECT set_config('ivfflat.probes', $1, true),
              set_config('ivfflat.iterative_scan', 'relaxed_order', true)`,
      [String(ivfflatProbes)]
    );
    return fn(client);
  });
}

export class RecommendationRepository {
  async findIdentitySimilar(
    params: SimilarityParams & { seedTrackId: string; seedFriendId: number }
  ): Promise<RecommendationCandidateRow[]> {
    return this.findSimilar("identity", params);
  }

  async findAudioSimilar(
    params: SimilarityParams & { seedTrackId: string; seedFriendId: number }
  ): Promise<RecommendationCandidateRow[]> {
    return this.findSimilar("audio_vibe", params);
  }

  async findIdentitySimilarByCentroid(
    params: SimilarityParams & { seedTracks: SeedTrackPair[] }
  ): Promise<RecommendationCandidateRow[]> {
    return this.findSimilarByCentroid("identity", params);
  }

  async findAudioSimilarByCentroid(
    params: SimilarityParams & { seedTracks: SeedTrackPair[] }
  ): Promise<RecommendationCandidateRow[]> {
    return this.findSimilarByCentroid("audio_vibe", params);
  }

  private async findSimilar(
    kind: SimilarityKind,
    params: SimilarityParams & { seedTrackId: string; seedFriendId: number }
  ): Promise<RecommendationCandidateRow[]> {
    return withVectorScan(params.ivfflatProbes, async (client) => {
      const embeddingResult = await client.query<{ embedding: unknown }>(
        `SELECT embedding FROM track_embeddings
         WHERE track_id = $1 AND friend_id = $2 AND embedding_type = '${kind}'
           AND model = $3 AND template_version = $4`,
        [params.seedTrackId, params.seedFriendId, params.model, params.templateVersion]
      );

      if (embeddingResult.rows.length === 0) {
        return [];
      }

      const seedEmbedding = embeddingResult.rows[0].embedding;
      const vector = castVector("te.embedding", params.dims);
      const values: unknown[] = [
        seedEmbedding,
        params.seedTrackId,
        params.seedFriendId,
        params.limit,
        params.model,
        params.templateVersion,
      ];
      const library =
        params.libraryFriendId === undefined
          ? ""
          : `AND t.friend_id = $${values.push(params.libraryFriendId)}`;

      const result = await client.query<RecommendationCandidateRowRaw>(
        `
        SELECT * FROM (
          SELECT ${CANDIDATE_COLUMNS},
            ${vector} <=> $1::vector(${params.dims}) AS distance
          FROM track_embeddings te
          JOIN tracks t ON te.track_id = t.track_id AND te.friend_id = t.friend_id
          WHERE te.embedding_type = '${kind}'
            AND te.model = $5
            AND te.template_version = $6
            AND NOT (te.track_id = $2 AND te.friend_id = $3)
            AND t.deleted_at IS NULL
            ${library}
          ORDER BY ${vector} <=> $1::vector(${params.dims})
          LIMIT $4
        ) candidates
        ORDER BY distance
        `,
        values
      );

      return normalizeRows(result.rows);
    });
  }

  private async findSimilarByCentroid(
    kind: SimilarityKind,
    params: SimilarityParams & { seedTracks: SeedTrackPair[] }
  ): Promise<RecommendationCandidateRow[]> {
    if (params.seedTracks.length === 0) return [];

    return withVectorScan(params.ivfflatProbes, async (client) => {
      const { valuesClause, params: queryParams, limitParamIndex } = buildSeedValues(
        params.seedTracks
      );
      const modelParamIndex = limitParamIndex + 1;
      const vector = castVector("te.embedding", params.dims);
      const seedVector = castVector("se.embedding", params.dims);
      const values: unknown[] = [...queryParams, params.limit, params.model, params.templateVersion];
      const library =
        params.libraryFriendId === undefined
          ? ""
          : `AND t.friend_id = $${values.push(params.libraryFriendId)}`;

      const result = await client.query<RecommendationCandidateRowRaw>(
        `
        WITH seeds(track_id, friend_id) AS (
          VALUES ${valuesClause}
        ),
        seed_embedding AS (
          SELECT AVG(te.embedding) AS embedding
          FROM track_embeddings te
          JOIN seeds s
            ON te.track_id = s.track_id
           AND te.friend_id = s.friend_id
          WHERE te.embedding_type = '${kind}' AND te.model = $${modelParamIndex} AND te.template_version = $${modelParamIndex + 1}
        )
        SELECT * FROM (
          SELECT ${CANDIDATE_COLUMNS},
            ${vector} <=> ${seedVector} AS distance
          FROM track_embeddings te
          JOIN tracks t ON te.track_id = t.track_id AND te.friend_id = t.friend_id
          CROSS JOIN seed_embedding se
          WHERE te.embedding_type = '${kind}'
            AND te.model = $${modelParamIndex} AND te.template_version = $${modelParamIndex + 1}
            AND se.embedding IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM seeds s
              WHERE s.track_id = te.track_id AND s.friend_id = te.friend_id
            )
            AND t.deleted_at IS NULL
            ${library}
          ORDER BY ${vector} <=> ${seedVector}
          LIMIT $${limitParamIndex}
        ) candidates
        ORDER BY distance
        `,
        values
      );

      return normalizeRows(result.rows);
    });
  }
}

export const recommendationRepository = new RecommendationRepository();
