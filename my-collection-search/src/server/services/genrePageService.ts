import type { GenrePageRef, GenrePageResponse } from "@/api-contract/schemas";
import { normalizeGenreName } from "@/lib/genres/normalization";
import { genreRepository, type GenreRow } from "@/server/repositories/genreRepository";
import { genrePageRepository } from "@/server/repositories/genrePageRepository";

const TOP_TRACKS = 10;
const TOP_ALBUMS = 8;
const RELATED = 12;

/** Dates as ISO strings, the shape JSON gives them, so rows parse the same before and after the wire. */
function jsonDates<T extends Record<string, unknown>>(row: T): T {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value])
  ) as T;
}

/** Biggest first, then by name; zero-count genres stay, last. */
function byCount(a: GenrePageRef, b: GenrePageRef): number {
  return b.track_count - a.track_count || a.name.localeCompare(b.name);
}

/**
 * Everything the genre page shows (#376), for a slug or id: where the genre
 * sits in the taxonomy, how much of the collection it covers, and what's in
 * it. Counts and lists use the same genre filter as search (#375), so each
 * number matches what "search this genre" returns. `null` for an unknown genre.
 */
export async function getGenrePage(ref: string, friendId?: number): Promise<GenrePageResponse | null> {
  const flat = await genreRepository.listFlat();
  const key = ref.trim().toLowerCase();
  const genre = flat.find((row) => row.slug === key || row.id === key);
  if (!genre) return null;

  const filter = await genreRepository.expandToFilter([genre.id]);
  const facetWhere = friendId === undefined ? [] : ["t.friend_id = $1"];
  const facetParams = friendId === undefined ? [] : [friendId];
  const [facets, counts, topTracks, topAlbums] = await Promise.all([
    genreRepository.trackFacets(facetWhere, facetParams),
    genrePageRepository.counts({
      genreId: genre.id,
      ownKeys: [normalizeGenreName(genre.name), ...genre.aliases],
      filter,
      friendId,
    }),
    genrePageRepository.topTracks(filter, friendId, TOP_TRACKS),
    genrePageRepository.topAlbums(filter, friendId, TOP_ALBUMS),
  ]);

  const totals = new Map(facets.map((facet) => [facet.id, facet.track_count]));
  const toRef = (row: GenreRow): GenrePageRef => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    track_count: totals.get(row.id) ?? 0,
  });

  const byId = new Map(flat.map((row) => [row.id, row]));
  const ancestors: GenrePageResponse["ancestors"] = [];
  for (let parent = genre.parent_id ? byId.get(genre.parent_id) : undefined; parent; ) {
    ancestors.unshift({ id: parent.id, name: parent.name, slug: parent.slug });
    parent = parent.parent_id ? byId.get(parent.parent_id) : undefined;
  }

  return {
    genre: {
      id: genre.id,
      name: genre.name,
      slug: genre.slug,
      parent_id: genre.parent_id,
      source: genre.source,
      aliases: genre.aliases,
    },
    ancestors,
    children: flat.filter((row) => row.parent_id === genre.id).map(toRef).sort(byCount),
    related: flat
      .filter((row) => row.parent_id === genre.parent_id && row.id !== genre.id)
      .map(toRef)
      .filter((row) => row.track_count > 0)
      .sort(byCount)
      .slice(0, RELATED),
    counts: { ...counts, tracks_total: totals.get(genre.id) ?? 0 },
    top_tracks: topTracks.map(jsonDates) as GenrePageResponse["top_tracks"],
    top_albums: topAlbums.map(jsonDates) as GenrePageResponse["top_albums"],
  };
}
