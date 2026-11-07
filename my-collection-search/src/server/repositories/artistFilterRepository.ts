import type { ArtistFilterRef } from "@/api-contract/schemas";
import { dbQuery } from "@/lib/serverDb";

export type ResolvedArtistRef = ArtistFilterRef & { requested: string };

/**
 * The artists `artist` filter values name (#709): each value a slug or a
 * numeric id. A merged artist resolves to the artist it was merged into,
 * through the whole redirect chain, so an old link still filters. Values that
 * name no artist are simply absent from the result.
 */
export class ArtistFilterRepository {
  async resolve(values: string[]): Promise<ResolvedArtistRef[]> {
    if (values.length === 0) return [];
    const { rows } = await dbQuery<ResolvedArtistRef>(
      `
      WITH RECURSIVE requested AS (
        SELECT v.value AS requested, ar.id, ar.merged_into, 0 AS depth
        FROM unnest($1::text[]) AS v(value)
        JOIN artists ar
          ON ar.slug = lower(v.value)
          -- Compared as text: a cast would be evaluated for slugs too, and fail.
          OR ar.id::text = v.value
        UNION ALL
        SELECT r.requested, ar.id, ar.merged_into, r.depth + 1
        FROM requested r JOIN artists ar ON ar.id = r.merged_into
        WHERE r.depth < 20
      )
      SELECT DISTINCT ON (r.requested) r.requested, ar.id, ar.name, ar.slug
      FROM requested r JOIN artists ar ON ar.id = r.id
      WHERE r.merged_into IS NULL
      ORDER BY r.requested, r.depth DESC
      `,
      [values],
    );
    return rows;
  }
}

export const artistFilterRepository = new ArtistFilterRepository();
