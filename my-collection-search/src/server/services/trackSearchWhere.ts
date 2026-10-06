import { trackSearchGetQuerySchema } from "@/api-contract/schemas";
import {
  attributeFilterClauses,
  missingFilterClause,
  parseTrackFilterSpec,
  type TrackAttributeFilters,
} from "@/lib/trackFilterSpec";

/** WHERE clauses over `tracks t`, and the values their `$n` refer to. */
export type TrackSearchWhere = {
  where: string[];
  params: unknown[];
};

/** The `filter` string's friend and "missing X" checks. */
export function parseTrackFilter(filter: string | undefined): TrackSearchWhere {
  const spec = parseTrackFilterSpec(filter);
  const where: string[] = [];
  const params: unknown[] = [];

  if (spec.friendId !== undefined) {
    params.push(spec.friendId);
    where.push(`friend_id = $${params.length}`);
  }
  where.push(...spec.missing.map((name) => missingFilterClause(name)));

  return { where, params };
}

/**
 * Every filter `/api/tracks/search` applies besides the words: the `filter`
 * string, `friend_id` and the attribute filters. Search and its genre facets
 * (#375) build from this, so a facet count is what the filter would return.
 */
export function buildTrackSearchWhere(input: {
  filter?: string;
  friendId?: number;
  attributes: TrackAttributeFilters;
}): TrackSearchWhere {
  const result = parseTrackFilter(input.filter);
  const bind = (value: unknown) => {
    result.params.push(value);
    return `$${result.params.length}`;
  };
  if (input.friendId !== undefined) result.where.push(`friend_id = ${bind(input.friendId)}`);
  result.where.push(...attributeFilterClauses(input.attributes, bind, "t"));
  return result;
}

/** Full-text or trigram match of title, artist or album against the words at `ref`. */
export function lexicalMatchClause(ref: string): string {
  return `(
        to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(artist, '') || ' ' || coalesce(album, '')) @@ plainto_tsquery('simple', ${ref})
        OR similarity(coalesce(title, ''), ${ref}) > 0.15
        OR similarity(coalesce(artist, ''), ${ref}) > 0.15
        OR similarity(coalesce(album, ''), ${ref}) > 0.15
      )`;
}

/** `/api/tracks/search`'s query string, with `genre` read as the repeatable parameter it is. */
export function parseTrackSearchParams(searchParams: URLSearchParams) {
  // Object.fromEntries would keep only the last `genre`.
  const genres = searchParams.getAll("genre");
  return trackSearchGetQuerySchema.safeParse({
    ...Object.fromEntries(searchParams.entries()),
    ...(genres.length > 0 ? { genre: genres } : {}),
  });
}
