import type { ArtistPageResponse } from "@/api-contract/schemas";
import { normaliseArtistName } from "@/lib/artists/normalization";
import { artistPageRepository } from "@/server/repositories/artistPageRepository";
import { artistRepository } from "@/server/repositories/artistRepository";

const TOP_TRACKS = 50;
const GENRES = 12;
const COLLABORATORS = 12;

/** Dates as ISO strings, the shape JSON gives them, so rows parse the same before and after the wire. */
function jsonDates<T extends Record<string, unknown>>(row: T): T {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : value,
    ]),
  ) as T;
}

/**
 * The artist page (#707) for a slug, scoped to one collection when `friendId`
 * is given. `null` for an unknown artist. Placeholders (`Various`) come back
 * flagged with empty lists: they have no page, and the client sends the viewer
 * to the album search instead.
 */
export async function getArtistPage(
  slug: string,
  friendId?: number,
): Promise<ArtistPageResponse | null> {
  const artist = await artistRepository.findBySlug(slug.trim().toLowerCase());
  if (!artist) return null;
  const header = {
    id: artist.id,
    name: artist.name,
    sort_name: artist.sort_name,
    slug: artist.slug,
    discogs_artist_id: artist.discogs_artist_id,
    is_placeholder: artist.is_placeholder,
  };
  if (artist.is_placeholder) {
    return {
      artist: header,
      aliases: [],
      counts: { albums: 0, appears_on: 0, tracks: 0, spins: 0, year_min: null, year_max: null },
      albums: [],
      top_tracks: [],
      top_tracks_by: "albums",
      genres: [],
      collaborators: [],
    };
  }

  const [aliases, counts, albums, tracks, genres, collaborators] = await Promise.all([
    artistRepository.listAliases(artist.id),
    artistPageRepository.counts(artist.id, friendId),
    artistPageRepository.albums(artist.id, friendId),
    artistPageRepository.topTracks(artist.id, friendId, TOP_TRACKS),
    artistPageRepository.genres(artist.id, friendId, GENRES),
    artistPageRepository.collaborators(artist.id, friendId, COLLABORATORS),
  ]);

  const own = normaliseArtistName(artist.name);
  return {
    artist: header,
    aliases: aliases.filter((a) => a.alias_normalized !== own).map((a) => a.alias),
    counts,
    albums: albums.map(jsonDates) as ArtistPageResponse["albums"],
    top_tracks: tracks.map(jsonDates) as ArtistPageResponse["top_tracks"],
    top_tracks_by: counts.spins > 0 ? "spins" : "albums",
    genres,
    collaborators,
  };
}
