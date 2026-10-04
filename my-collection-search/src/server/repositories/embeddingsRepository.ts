import type { PoolClient } from "pg";
import { dbQuery } from "@/lib/serverDb";
import { CURRENT_TEMPLATE_VERSIONS } from "@/lib/embeddings/templateVersions";
import type { BackfillOptions, EmbeddingBackfillOptions } from "@/types/backfill";
import type {
  EmbeddingTrackRef,
  SimilarIdentityTrack,
  SimilarityFilters,
  SimilarVibeTrack,
} from "@/types/embeddings";

type Queryable = Pick<PoolClient, "query">;

type SimilarIdentityTrackRow = Omit<SimilarIdentityTrack, "distance"> & {
  distance: string | number;
};

type SimilarVibeTrackRow = Omit<SimilarVibeTrack, "distance"> & {
  distance: string | number;
};

/**
 * `dims` can't be bound as a query parameter (a type modifier must be a
 * literal at parse time), so it's interpolated directly — safe here because
 * every caller sources it from `embedding_model_settings`, never from
 * request input. Casting to the serving model's fixed dimension makes the
 * query's `<=>` expression match the partial expression index created for
 * that `(embedding_type, model)` pair (#386); without it, the planner has no
 * index whose expression matches and falls back to a sequential scan.
 */
function castVector(column: string, dims: number): string {
  if (!Number.isInteger(dims) || dims <= 0) {
    throw new Error(`Invalid vector dims: ${dims}`);
  }
  return `(${column}::vector(${dims}))`;
}

export class EmbeddingsRepository {
  /**
   * Candidate tracks for one embedding type (#388): tracks with no row at the
   * kind's *target* model and the code's *current* template version (#407).
   * A row from another model or an older template doesn't count, so a model
   * switch or a template bump is picked up by the periodic sweep and a
   * default backfill without forcing a re-embed of everything.
   * `force` drops the "missing" check (and the join, since nothing needs it)
   * but keeps the audio-vibe "has audio data" gate: forcing a re-embed of a
   * track with no BPM/key/mood would just embed emptiness.
   */
  async listTracksForBackfill(
    options: EmbeddingBackfillOptions
  ): Promise<EmbeddingTrackRef[]> {
    const { type, friend_id, release_id, track_ids, force, limit } = options;
    const params: unknown[] = [];
    const clauses: string[] = [];
    let from = "FROM tracks t";

    if (!force) {
      params.push(type, CURRENT_TEMPLATE_VERSIONS[type]);
      const typeParam = `$${params.length - 1}`;
      const versionParam = `$${params.length}`;
      from += `
        LEFT JOIN embedding_model_settings ems
          ON ems.embedding_type = ${typeParam}
        LEFT JOIN track_embeddings te
          ON t.track_id = te.track_id
         AND t.friend_id = te.friend_id
         AND te.embedding_type = ${typeParam}
         AND te.model = ems.target_model
         AND te.template_version = ${versionParam}`;
      clauses.push("te.id IS NULL");
    }

    if (type === "audio_vibe") {
      clauses.push(
        "(t.bpm IS NOT NULL OR t.key IS NOT NULL OR t.danceability IS NOT NULL " +
          "OR t.mood_happy IS NOT NULL OR t.mood_sad IS NOT NULL " +
          "OR t.mood_relaxed IS NOT NULL OR t.mood_aggressive IS NOT NULL)"
      );
    }

    if (friend_id) {
      params.push(friend_id);
      clauses.push(`t.friend_id = $${params.length}`);
    }
    if (release_id) {
      params.push(release_id);
      clauses.push(`t.release_id = $${params.length}`);
    }
    if (track_ids && track_ids.length > 0) {
      params.push(track_ids);
      clauses.push(`t.track_id = ANY($${params.length})`);
    }

    let query = `
      SELECT t.track_id, t.friend_id
      ${from}
      ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY t.friend_id, t.track_id
    `;
    if (limit) {
      params.push(limit);
      query += ` LIMIT $${params.length}`;
    }

    const result = await dbQuery<EmbeddingTrackRef>(query, params);
    return result.rows;
  }

  async listTracksNeedingIdentityEmbeddings(
    options: BackfillOptions
  ): Promise<EmbeddingTrackRef[]> {
    return this.listTracksForBackfill({ ...options, type: "identity" });
  }

  async listTracksNeedingAudioVibeEmbeddings(
    options: BackfillOptions
  ): Promise<EmbeddingTrackRef[]> {
    return this.listTracksForBackfill({ ...options, type: "audio_vibe" });
  }

  /**
   * Row counts per model and template version for one kind (#386, #407) —
   * the coverage readout an operator watches mid-switch to decide when the
   * new set is complete enough to flip serving to it.
   */
  async countEmbeddingsByModel(
    embeddingType: "identity" | "audio_vibe",
    friendId?: number
  ): Promise<Array<{ model: string; dims: number; template_version: number; count: number }>> {
    const params: unknown[] = [embeddingType];
    let where = "WHERE embedding_type = $1";
    if (friendId !== undefined) {
      params.push(friendId);
      where += ` AND friend_id = $${params.length}`;
    }
    const result = await dbQuery<{
      model: string;
      dims: number;
      template_version: number;
      count: string;
    }>(
      `
      SELECT model, dims, template_version, COUNT(*)::int AS count
      FROM track_embeddings
      ${where}
      GROUP BY model, dims, template_version
      ORDER BY count DESC, template_version DESC
      `,
      params
    );
    return result.rows.map((row) => ({ ...row, count: Number(row.count) }));
  }

  /** For `/api/embeddings/status` — the denominator behind the missing counts. */
  async countTracks(friendId?: number): Promise<number> {
    const params: unknown[] = [];
    let where = "";
    if (friendId !== undefined) {
      params.push(friendId);
      where = `WHERE friend_id = $${params.length}`;
    }
    const result = await dbQuery<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM tracks ${where}`,
      params
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async setIvfflatProbes(client: Queryable, probes: number): Promise<void> {
    await client.query("SELECT set_config('ivfflat.probes', $1, false)", [
      String(probes),
    ]);
  }

  /**
   * `model` pins this to the serving model (#386) — mid-switch, a track may
   * have rows for both the old and new model, and the one that's "serving"
   * is the one similarity reads should use, not whichever is newest.
   */
  async findSourceEmbedding(
    client: Queryable,
    trackId: string,
    friendId: number,
    embeddingType: "identity" | "audio_vibe",
    model: string,
    templateVersion: number
  ): Promise<unknown | null> {
    const result = await client.query<{ embedding: unknown }>(
      `
      SELECT embedding
      FROM track_embeddings
      WHERE track_id = $1 AND friend_id = $2 AND embedding_type = $3
        AND model = $4 AND template_version = $5
      LIMIT 1
      `,
      [trackId, friendId, embeddingType, model, templateVersion]
    );
    return result.rows[0]?.embedding ?? null;
  }

  /**
   * Serving-model vectors for a batch of tracks, in pgvector text form
   * (`[0.1,0.2,...]`) — the shape ga-service parses. Pinned to `model` for
   * the same reason as `findSourceEmbedding`: mid-switch a track can have
   * rows for two models, and mixing them in one optimisation would compare
   * vectors from different spaces. Tracks with no row are simply absent.
   */
  async findEmbeddingsForTracks(
    tracks: Array<{ trackId: string; friendId: number }>,
    embeddingType: "identity" | "audio_vibe",
    model: string,
    templateVersion: number
  ): Promise<Array<{ track_id: string; friend_id: number; embedding: string }>> {
    if (tracks.length === 0) return [];
    const result = await dbQuery<{
      track_id: string;
      friend_id: number;
      embedding: string;
    }>(
      `
      SELECT te.track_id, te.friend_id, te.embedding::text AS embedding
      FROM track_embeddings te
      JOIN UNNEST($1::text[], $2::int[]) AS q(track_id, friend_id)
        ON te.track_id = q.track_id AND te.friend_id = q.friend_id
      WHERE te.embedding_type = $3 AND te.model = $4 AND te.template_version = $5
      `,
      [
        tracks.map((t) => t.trackId),
        tracks.map((t) => t.friendId),
        embeddingType,
        model,
        templateVersion,
      ]
    );
    return result.rows;
  }

  async findSimilarIdentityTracks(
    client: Queryable,
    params: {
      sourceEmbedding: unknown;
      sourceTrackId: string;
      sourceFriendId: number;
      model: string;
      templateVersion: number;
      dims: number;
      limit: number;
      filters: SimilarityFilters;
    }
  ): Promise<SimilarIdentityTrack[]> {
    const { sourceEmbedding, sourceTrackId, sourceFriendId, model, templateVersion, dims, limit, filters } =
      params;
    const vector = castVector("te.embedding", dims);
    const queryParams: unknown[] = [
      sourceEmbedding,
      sourceTrackId,
      sourceFriendId,
      model,
      templateVersion,
    ];
    const filterClauses: string[] = [];
    let idx = 6;

    if (filters.country) {
      filterClauses.push(`a.country = $${idx++}`);
      queryParams.push(filters.country);
    }

    if (filters.tags && filters.tags.length > 0) {
      const tagClauses = filters.tags.map(() => `LOWER(t.local_tags) LIKE $${idx++}`);
      filterClauses.push(`(${tagClauses.join(" OR ")})`);
      queryParams.push(...filters.tags.map((tag) => `%${tag.toLowerCase()}%`));
    }

    queryParams.push(limit);

    const result = await client.query<SimilarIdentityTrackRow>(
      `
      SELECT
        t.track_id,
        t.friend_id,
        t.title,
        t.artist,
        t.album,
        t.year,
        COALESCE(t.genres, '{}') AS genres,
        COALESCE(t.styles, '{}') AS styles,
        COALESCE(t.local_tags, '') AS local_tags,
        t.album_thumbnail,
        t.audio_file_album_art_url,
        t.bpm,
        t.key,
        t.star_rating,
        t.duration_seconds,
        t.position,
        t.discogs_url,
        t.apple_music_url,
        t.youtube_url,
        t.local_audio_url,
        te.identity_text,
        ${vector} <=> $1::vector(${dims}) AS distance
      FROM track_embeddings te
      JOIN tracks t ON te.track_id = t.track_id AND te.friend_id = t.friend_id
      LEFT JOIN albums a ON t.release_id = a.release_id AND t.friend_id = a.friend_id
      WHERE te.embedding_type = 'identity'
        AND te.model = $4
        AND te.template_version = $5
        AND NOT (te.track_id = $2 AND te.friend_id = $3)
        ${filterClauses.length > 0 ? `AND ${filterClauses.join(" AND ")}` : ""}
      ORDER BY ${vector} <=> $1::vector(${dims})
      LIMIT $${idx}
      `,
      queryParams
    );

    return result.rows.map((row) => ({
      ...row,
      distance: Number(row.distance),
    }));
  }

  async findSimilarAudioVibeTracks(
    client: Queryable,
    params: {
      sourceEmbedding: unknown;
      sourceTrackId: string;
      sourceFriendId: number;
      model: string;
      templateVersion: number;
      dims: number;
      limit: number;
    }
  ): Promise<SimilarVibeTrack[]> {
    const vector = castVector("te.embedding", params.dims);
    const result = await client.query<SimilarVibeTrackRow>(
      `
      SELECT
        t.track_id,
        t.friend_id,
        t.title,
        t.artist,
        t.album,
        t.year,
        COALESCE(t.genres, '{}') AS genres,
        COALESCE(t.styles, '{}') AS styles,
        COALESCE(t.local_tags, '') AS local_tags,
        t.album_thumbnail,
        t.audio_file_album_art_url,
        t.bpm,
        t.key,
        t.star_rating,
        t.duration_seconds,
        t.position,
        t.discogs_url,
        t.apple_music_url,
        t.youtube_url,
        t.local_audio_url,
        t.danceability,
        t.mood_happy,
        t.mood_sad,
        t.mood_relaxed,
        t.mood_aggressive,
        te.identity_text,
        ${vector} <=> $1::vector(${params.dims}) AS distance
      FROM track_embeddings te
      JOIN tracks t ON te.track_id = t.track_id AND te.friend_id = t.friend_id
      WHERE te.embedding_type = 'audio_vibe'
        AND te.model = $5
        AND te.template_version = $6
        AND NOT (te.track_id = $2 AND te.friend_id = $3)
      ORDER BY ${vector} <=> $1::vector(${params.dims})
      LIMIT $4
      `,
      [
        params.sourceEmbedding,
        params.sourceTrackId,
        params.sourceFriendId,
        params.limit,
        params.model,
        params.templateVersion,
      ]
    );

    return result.rows.map((row) => ({
      ...row,
      distance: Number(row.distance),
    }));
  }

  async upsertTrackEmbedding(params: {
    trackId: string;
    friendId: number;
    embeddingType: "identity" | "audio_vibe";
    model: string;
    dims: number;
    embedding: number[];
    sourceHash: string;
    identityText: string;
    templateVersion?: number;
  }): Promise<void> {
    const pgVector = `[${params.embedding.join(",")}]`;
    await dbQuery(
      `
      INSERT INTO track_embeddings (
        track_id, friend_id, embedding_type, model, dims, embedding, source_hash, identity_text, template_version, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
      ON CONFLICT (track_id, friend_id, embedding_type, model, template_version)
      DO UPDATE SET
        embedding = EXCLUDED.embedding,
        source_hash = EXCLUDED.source_hash,
        identity_text = EXCLUDED.identity_text,
        dims = EXCLUDED.dims,
        updated_at = CURRENT_TIMESTAMP
      `,
      [
        params.trackId,
        params.friendId,
        params.embeddingType,
        params.model,
        params.dims,
        pgVector,
        params.sourceHash,
        params.identityText,
        params.templateVersion ?? 1,
      ]
    );
  }

  /**
   * The source hash of the row at exactly this model and template version.
   * Without both, a row from the other model or an older template could be
   * read instead, and its matching hash would skip the re-embed (#407).
   */
  async findEmbeddingSourceHash(
    trackId: string,
    friendId: number,
    embeddingType: "identity" | "audio_vibe",
    model: string,
    templateVersion: number
  ): Promise<string | null> {
    const result = await dbQuery<{ source_hash: string | null }>(
      `
      SELECT source_hash
      FROM track_embeddings
      WHERE track_id = $1 AND friend_id = $2 AND embedding_type = $3
        AND model = $4 AND template_version = $5
      LIMIT 1
      `,
      [trackId, friendId, embeddingType, model, templateVersion]
    );
    return result.rows[0]?.source_hash ?? null;
  }

  async listEmbeddingTypesForTrack(
    trackId: string,
    friendId: number
  ): Promise<string[]> {
    const result = await dbQuery<{ embedding_type: string }>(
      `
      SELECT embedding_type
      FROM track_embeddings
      WHERE track_id = $1 AND friend_id = $2
      `,
      [trackId, friendId]
    );
    return result.rows.map((row) => row.embedding_type);
  }

  async listEmbeddingTypesForTrackPairs(
    seedTracks: Array<{ trackId: string; friendId: number }>
  ): Promise<string[]> {
    if (seedTracks.length === 0) return [];

    const values: string[] = [];
    const params: Array<string | number> = [];

    for (let i = 0; i < seedTracks.length; i += 1) {
      const offset = i * 2;
      values.push(`($${offset + 1}::text, $${offset + 2}::integer)`);
      params.push(seedTracks[i].trackId, seedTracks[i].friendId);
    }

    const result = await dbQuery<{ embedding_type: string }>(
      `
      WITH seeds(track_id, friend_id) AS (
        VALUES ${values.join(", ")}
      )
      SELECT DISTINCT te.embedding_type
      FROM track_embeddings te
      JOIN seeds s
        ON te.track_id = s.track_id
       AND te.friend_id = s.friend_id
      `,
      params
    );

    return result.rows.map((row) => row.embedding_type);
  }
}

export const embeddingsRepository = new EmbeddingsRepository();
