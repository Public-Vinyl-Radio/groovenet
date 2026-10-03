import type { PoolClient } from "pg";
import { dbQuery } from "@/lib/serverDb";
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

export class EmbeddingsRepository {
  async listTracksForBackfill(
    options: EmbeddingBackfillOptions
  ): Promise<EmbeddingTrackRef[]> {
    const { type, friend_id, force, limit } = options;
    const params: Array<number> = [];
    let query = "";

    if (force) {
      if (type === "audio_vibe") {
        query = `
          SELECT track_id, friend_id
          FROM tracks
          WHERE (bpm IS NOT NULL OR key IS NOT NULL OR danceability IS NOT NULL
                 OR mood_happy IS NOT NULL OR mood_sad IS NOT NULL
                 OR mood_relaxed IS NOT NULL OR mood_aggressive IS NOT NULL)
          ${friend_id ? "AND friend_id = $1" : ""}
          ORDER BY friend_id, track_id
          ${limit ? `LIMIT $${friend_id ? 2 : 1}` : ""}
        `;
      } else {
        query = `
          SELECT track_id, friend_id
          FROM tracks
          ${friend_id ? "WHERE friend_id = $1" : ""}
          ORDER BY friend_id, track_id
          ${limit ? `LIMIT $${friend_id ? 2 : 1}` : ""}
        `;
      }

      if (friend_id) params.push(friend_id);
      if (limit) params.push(limit);
    } else {
      if (type === "audio_vibe") {
        query = `
          SELECT t.track_id, t.friend_id
          FROM tracks t
          LEFT JOIN track_embeddings te
            ON t.track_id = te.track_id
            AND t.friend_id = te.friend_id
            AND te.embedding_type = 'audio_vibe'
          WHERE te.id IS NULL
            AND (t.bpm IS NOT NULL OR t.key IS NOT NULL OR t.danceability IS NOT NULL
                 OR t.mood_happy IS NOT NULL OR t.mood_sad IS NOT NULL
                 OR t.mood_relaxed IS NOT NULL OR t.mood_aggressive IS NOT NULL)
          ${friend_id ? "AND t.friend_id = $1" : ""}
          ORDER BY t.friend_id, t.track_id
          ${limit ? `LIMIT $${friend_id ? 2 : 1}` : ""}
        `;
      } else {
        query = `
          SELECT t.track_id, t.friend_id
          FROM tracks t
          LEFT JOIN track_embeddings te
            ON t.track_id = te.track_id
            AND t.friend_id = te.friend_id
            AND te.embedding_type = 'identity'
          WHERE te.id IS NULL
          ${friend_id ? "AND t.friend_id = $1" : ""}
          ORDER BY t.friend_id, t.track_id
          ${limit ? `LIMIT $${friend_id ? 2 : 1}` : ""}
        `;
      }

      if (friend_id) params.push(friend_id);
      if (limit) params.push(limit);
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

  async setIvfflatProbes(client: Queryable, probes: number): Promise<void> {
    await client.query("SELECT set_config('ivfflat.probes', $1, false)", [
      String(probes),
    ]);
  }

  async findSourceEmbedding(
    client: Queryable,
    trackId: string,
    friendId: number,
    embeddingType: "identity" | "audio_vibe"
  ): Promise<unknown | null> {
    const result = await client.query<{ embedding: unknown }>(
      `
      SELECT embedding
      FROM track_embeddings
      WHERE track_id = $1 AND friend_id = $2 AND embedding_type = $3
      LIMIT 1
      `,
      [trackId, friendId, embeddingType]
    );
    return result.rows[0]?.embedding ?? null;
  }

  async findSimilarIdentityTracks(
    client: Queryable,
    params: {
      sourceEmbedding: unknown;
      sourceTrackId: string;
      sourceFriendId: number;
      limit: number;
      filters: SimilarityFilters;
    }
  ): Promise<SimilarIdentityTrack[]> {
    const { sourceEmbedding, sourceTrackId, sourceFriendId, limit, filters } = params;
    const queryParams: unknown[] = [sourceEmbedding, sourceTrackId, sourceFriendId];
    const filterClauses: string[] = [];
    let idx = 4;

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
        te.embedding <=> $1 AS distance
      FROM track_embeddings te
      JOIN tracks t ON te.track_id = t.track_id AND te.friend_id = t.friend_id
      LEFT JOIN albums a ON t.release_id = a.release_id AND t.friend_id = a.friend_id
      WHERE te.embedding_type = 'identity'
        AND NOT (te.track_id = $2 AND te.friend_id = $3)
        ${filterClauses.length > 0 ? `AND ${filterClauses.join(" AND ")}` : ""}
      ORDER BY te.embedding <=> $1
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
      limit: number;
    }
  ): Promise<SimilarVibeTrack[]> {
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
        te.embedding <=> $1 AS distance
      FROM track_embeddings te
      JOIN tracks t ON te.track_id = t.track_id AND te.friend_id = t.friend_id
      WHERE te.embedding_type = 'audio_vibe'
        AND NOT (te.track_id = $2 AND te.friend_id = $3)
      ORDER BY te.embedding <=> $1
      LIMIT $4
      `,
      [params.sourceEmbedding, params.sourceTrackId, params.sourceFriendId, params.limit]
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
      ON CONFLICT (track_id, friend_id, embedding_type)
      DO UPDATE SET
        embedding = EXCLUDED.embedding,
        source_hash = EXCLUDED.source_hash,
        identity_text = EXCLUDED.identity_text,
        model = EXCLUDED.model,
        dims = EXCLUDED.dims,
        template_version = EXCLUDED.template_version,
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

  async findEmbeddingSourceHash(
    trackId: string,
    friendId: number,
    embeddingType: "identity" | "audio_vibe"
  ): Promise<string | null> {
    const result = await dbQuery<{ source_hash: string | null }>(
      `
      SELECT source_hash
      FROM track_embeddings
      WHERE track_id = $1 AND friend_id = $2 AND embedding_type = $3
      LIMIT 1
      `,
      [trackId, friendId, embeddingType]
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
