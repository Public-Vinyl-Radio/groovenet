import type { GenrePageRef } from "@/api-contract/schemas";

/** Biggest first, then by name; zero-count genres stay, last. Shared by genrePageService and genreSimilarityService. */
export function byCount(a: GenrePageRef, b: GenrePageRef): number {
  return b.track_count - a.track_count || a.name.localeCompare(b.name);
}
