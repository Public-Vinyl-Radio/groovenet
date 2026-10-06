import { dbQuery, withDbTransaction } from "@/lib/serverDb";
import { normalizeGenreName } from "@/lib/genres/normalization";

export type TrackGenreSource = "manual" | "enrichment" | "reconciliation";

export type ResolvedGenreRefs = {
  /** Distinct taxonomy ids, in the order they were first referenced. */
  ids: string[];
  /** References that match no id, canonical name or alias, as sent. */
  unknown: string[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Select-list expression giving a track row its taxonomy genres as a JSON
 * array (never null), so reads carry them without a second round trip.
 * `alias` is the `tracks` alias in the surrounding query.
 */
export function trackGenresSelectSql(alias = "t"): string {
  return `COALESCE((
    SELECT json_agg(json_build_object(
      'id', g.id, 'name', g.name, 'slug', g.slug,
      'parent_id', g.parent_id, 'parent_name', gp.name
    ) ORDER BY g.name)
    FROM track_genres tg
    JOIN genres g ON g.id = tg.genre_id
    LEFT JOIN genres gp ON gp.id = g.parent_id
    WHERE tg.track_id = ${alias}.track_id AND tg.friend_id = ${alias}.friend_id
  ), '[]'::json) AS track_genres`;
}

/**
 * Normalises free-text descriptors: the genre spelling fold, then de-duplicated
 * with blanks dropped. Descriptors are deliberately not checked against the
 * taxonomy; they hold the mood words that genres must not.
 */
export function normalizeDescriptors(values: string[]): string[] {
  return [...new Set(values.map(normalizeGenreName).filter(Boolean))];
}

export type ReleaseGenreCount = { name: string; track_count: number };

export class TrackGenreRepository {
  /**
   * Resolves genre ids or names to taxonomy ids. Names go through the shared
   * normalisation and then the canonical name or an alias. Nothing is ever
   * created here: an unknown name is reported, not added to the taxonomy.
   */
  async resolveGenreRefs(refs: string[]): Promise<ResolvedGenreRefs> {
    if (refs.length === 0) return { ids: [], unknown: [] };
    const ids = refs.filter((ref) => UUID_RE.test(ref)).map((ref) => ref.toLowerCase());
    const names = refs.filter((ref) => !UUID_RE.test(ref)).map(normalizeGenreName);

    const { rows } = await dbQuery<{ ref: string; genre_id: string; is_alias: boolean }>(
      `
      SELECT g.id::text AS ref, g.id::text AS genre_id, false AS is_alias
      FROM genres g WHERE g.id::text = ANY($1::text[])
      UNION ALL
      SELECT g.normalized_name AS ref, g.id::text AS genre_id, false AS is_alias
      FROM genres g WHERE g.normalized_name = ANY($2::text[])
      UNION ALL
      SELECT a.alias_normalized AS ref, a.genre_id::text AS genre_id, true AS is_alias
      FROM genre_aliases a WHERE a.alias_normalized = ANY($2::text[])
      `,
      [ids, names]
    );
    // A canonical name wins over an alias spelled the same way: the seed has
    // `Bossanova` as both a Discogs style and an alias of `Bossa Nova`.
    const byRef = new Map<string, string>();
    for (const row of [...rows].sort((a, b) => Number(b.is_alias) - Number(a.is_alias))) {
      byRef.set(row.ref, row.genre_id);
    }

    const resolved: string[] = [];
    const unknown: string[] = [];
    for (const ref of refs) {
      const key = UUID_RE.test(ref) ? ref.toLowerCase() : normalizeGenreName(ref);
      const genreId = byRef.get(key);
      if (genreId === undefined) unknown.push(ref);
      else if (!resolved.includes(genreId)) resolved.push(genreId);
    }
    return { ids: resolved, unknown };
  }

  /**
   * The genres linked to a release's other live tracks, most used first: what
   * the rest of the album has already been called, for enrichment to reuse.
   */
  async listReleaseGenreCounts(
    releaseId: string,
    friendId: number,
    excludeTrackId: string,
    limit = 5
  ): Promise<ReleaseGenreCount[]> {
    const { rows } = await dbQuery<ReleaseGenreCount>(
      `
      SELECT g.name, COUNT(*)::integer AS track_count
      FROM track_genres tg
      JOIN tracks t ON t.track_id = tg.track_id AND t.friend_id = tg.friend_id
      JOIN genres g ON g.id = tg.genre_id
      WHERE t.release_id = $1 AND t.friend_id = $2 AND t.track_id <> $3
        AND t.deleted_at IS NULL
      GROUP BY g.name
      ORDER BY track_count DESC, g.name ASC
      LIMIT $4
      `,
      [releaseId, friendId, excludeTrackId, limit]
    );
    return rows;
  }

  /**
   * Makes a track's genre links exactly `genreIds`. Links already present keep
   * their original `source` and `created_at`, so re-saving a track does not
   * relabel a reconciled genre as manual.
   */
  async replaceTrackGenres(
    trackId: string,
    friendId: number,
    genreIds: string[],
    source: TrackGenreSource
  ): Promise<void> {
    await withDbTransaction(async (client) => {
      await client.query(
        `DELETE FROM track_genres
         WHERE track_id = $1 AND friend_id = $2 AND NOT (genre_id = ANY($3::uuid[]))`,
        [trackId, friendId, genreIds]
      );
      if (genreIds.length === 0) return;
      await client.query(
        `INSERT INTO track_genres (track_id, friend_id, genre_id, source)
         SELECT $1, $2, genre_id, $4 FROM unnest($3::uuid[]) AS genre_id
         ON CONFLICT DO NOTHING`,
        [trackId, friendId, genreIds, source]
      );
    });
  }
}

export const trackGenreRepository = new TrackGenreRepository();
