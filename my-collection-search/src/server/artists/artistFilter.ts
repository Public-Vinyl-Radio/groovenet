import type { ArtistFilterRef } from "@/api-contract/schemas";
import { artistFilterRepository } from "@/server/repositories/artistFilterRepository";

export type ArtistFilterResolution =
  | { ids: number[] | undefined; artists: ArtistFilterRef[]; unknown?: undefined }
  | { ids?: undefined; artists?: undefined; unknown: string[] };

/**
 * Resolves the `artist` search parameter (#709) — slugs or ids — into artist
 * ids for the SQL and refs for the chips, in request order and without
 * repeats. Anything that names no artist is `unknown`, for the caller to
 * reject, like an unknown genre: a stale link should fail loudly, not
 * quietly widen the search to everything.
 */
export async function resolveArtistFilter(refs: string[]): Promise<ArtistFilterResolution> {
  const values = [...new Set(refs.map((ref) => ref.trim()).filter(Boolean))];
  if (values.length === 0) return { ids: undefined, artists: [] };
  const rows = await artistFilterRepository.resolve(values);
  const byValue = new Map(rows.map((row) => [row.requested, row]));
  const unknown = values.filter((value) => !byValue.has(value));
  if (unknown.length > 0) return { unknown };
  const artists = new Map<number, ArtistFilterRef>();
  for (const value of values) {
    const { id, name, slug } = byValue.get(value)!;
    artists.set(id, { id, name, slug });
  }
  return { ids: [...artists.keys()], artists: [...artists.values()] };
}

/** The 400 body for artist filter values that name no artist. */
export function unknownArtistsError(unknown: string[]) {
  return { error: `Unknown artist: ${unknown.join(", ")}`, unknown };
}
