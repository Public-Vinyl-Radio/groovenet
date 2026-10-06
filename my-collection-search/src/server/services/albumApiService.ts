import { dbQuery } from "@/lib/serverDb";
import type { Album, Track } from "@/types/track";
import { albumRepository } from "@/server/repositories/albumRepository";
import { albumGenreFilterClause, type GenreFilter } from "@/lib/trackFilterSpec";

type AlbumSearchHit = Record<string, unknown>;

export class AlbumApiService {
  async searchAlbums(params: {
    q: string;
    limit: number;
    offset: number;
    friendId?: string | null;
    sort: string;
    missingLibraryIdentifier?: boolean;
    missingLocalCoverArtUrl?: boolean;
    missingAudio?: boolean;
    genreFilter?: GenreFilter;
  }): Promise<{
    hits: AlbumSearchHit[];
    estimatedTotalHits: number;
    offset: number;
    limit: number;
    query: string;
    sort: string;
  }> {
    const queryText = params.q.trim();
    const sqlParams: unknown[] = [];
    const whereClauses: string[] = [];
    let queryParamRef: string | null = null;

    if (params.friendId) {
      sqlParams.push(Number(params.friendId));
      whereClauses.push(`a.friend_id = $${sqlParams.length}`);
    }

    if (params.missingLibraryIdentifier) {
      whereClauses.push("a.library_identifier IS NULL");
    }

    if (params.missingAudio) {
      whereClauses.push(
        `EXISTS (
          SELECT 1 FROM tracks t
          WHERE t.release_id = a.release_id
            AND t.friend_id = a.friend_id
            AND (t.local_audio_url IS NULL OR btrim(t.local_audio_url) = '')
            AND t.deleted_at IS NULL
        )`
      );
    }

    if (params.missingLocalCoverArtUrl) {
      whereClauses.push(
        `(
          (a.audio_file_album_art_url IS NULL OR btrim(a.audio_file_album_art_url) = '')
          AND NOT EXISTS (
            SELECT 1
            FROM tracks t
            WHERE t.release_id = a.release_id
              AND t.friend_id = a.friend_id
              AND t.audio_file_album_art_url IS NOT NULL
              AND btrim(t.audio_file_album_art_url) <> ''
          )
        )`
      );
    }

    if (params.genreFilter) {
      whereClauses.push(
        albumGenreFilterClause(
          params.genreFilter,
          (value) => {
            sqlParams.push(value);
            return `$${sqlParams.length}`;
          },
          "a"
        )
      );
    }

    if (queryText.length > 0) {
      sqlParams.push(queryText);
      queryParamRef = `$${sqlParams.length}`;
      whereClauses.push(
        `(
          to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(artist, '')) @@ plainto_tsquery('simple', ${queryParamRef})
          OR similarity(coalesce(title, ''), ${queryParamRef}) > 0.15
          OR similarity(coalesce(artist, ''), ${queryParamRef}) > 0.15
        )`
      );
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const sortMap: Record<string, string> = {
      "created_at:desc": "created_at DESC, release_id DESC, friend_id DESC",
      "date_added:desc": "date_added DESC NULLS LAST, release_id DESC, friend_id DESC",
      "date_added:asc": "date_added ASC NULLS LAST, release_id ASC, friend_id ASC",
      "year:desc": "year DESC NULLS LAST, release_id DESC, friend_id DESC",
      "year:asc": "year ASC NULLS LAST, release_id ASC, friend_id ASC",
      "title:asc": "title ASC NULLS LAST, release_id ASC, friend_id ASC",
      "album_rating:desc":
        "album_rating DESC NULLS LAST, release_id DESC, friend_id DESC",
    };

    const rankSql =
      queryParamRef
        ? `
          (
            ts_rank(
              to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(artist, '')),
              plainto_tsquery('simple', ${queryParamRef})
            ) * 2.0
            + GREATEST(
              similarity(coalesce(title, ''), ${queryParamRef}),
              similarity(coalesce(artist, ''), ${queryParamRef})
            )
          ) DESC,
        `
        : "";

    const sortSql = sortMap[params.sort] ?? sortMap["created_at:desc"];

    sqlParams.push(params.limit);
    const limitRef = `$${sqlParams.length}`;
    sqlParams.push(params.offset);
    const offsetRef = `$${sqlParams.length}`;

    const { rows } = await dbQuery<AlbumSearchHit>(
      `
      SELECT a.*
      FROM albums a
      ${whereSql}
      ORDER BY ${rankSql} ${sortSql}
      LIMIT ${limitRef}
      OFFSET ${offsetRef}
      `,
      sqlParams
    );

    const countParams = [...sqlParams.slice(0, sqlParams.length - 2)];
    const { rows: countRows } = await dbQuery<{ total: string }>(
      `
      SELECT COUNT(*)::text AS total
      FROM albums a
      ${whereSql}
      `,
      countParams
    );

    const hits = rows;

    const friendIds = Array.from(
      new Set(
        hits
          .map((h) => h.friend_id)
          .filter((id): id is number => typeof id === "number")
      )
    );
    const usernameByFriendId = await albumRepository.getFriendUsernamesByIds(friendIds);

    const enrichedHits = hits.map((hit) => {
      const friend_id = hit.friend_id;
      if (typeof friend_id !== "number") return hit;
      return {
        ...hit,
        username: usernameByFriendId.get(friend_id) || undefined,
      };
    });

    const albumRefs = enrichedHits
      .map((h) => ({ release_id: h.release_id, friend_id: h.friend_id }))
      .filter(
        (r): r is { release_id: string; friend_id: number } =>
          typeof r.release_id === "string" && typeof r.friend_id === "number"
      );
    const coverByAlbumKey = await albumRepository.getFirstAudioCoverByAlbumRefs(
      albumRefs
    );

    const finalHits = enrichedHits.map((hit) => {
      const release_id = hit.release_id;
      const friend_id = hit.friend_id;
      if (typeof release_id !== "string" || typeof friend_id !== "number") {
        return hit;
      }
      return {
        ...hit,
        audio_file_album_art_url:
          coverByAlbumKey.get(`${release_id}:${friend_id}`) || undefined,
      };
    });

    return {
      hits: finalHits,
      estimatedTotalHits: Number(countRows[0]?.total ?? 0),
      offset: params.offset,
      limit: params.limit,
      query: params.q,
      sort: params.sort,
    };
  }

  async getAlbumDetail(
    releaseId: string,
    friendId: number
  ): Promise<{ album: Album; tracks: Track[] } | null> {
    const album = await albumRepository.getAlbumByReleaseAndFriend(
      releaseId,
      friendId
    );
    if (!album) return null;

    const tracks = await albumRepository.getTracksByReleaseAndFriend(
      releaseId,
      friendId
    );
    return { album, tracks };
  }
}

export const albumApiService = new AlbumApiService();
