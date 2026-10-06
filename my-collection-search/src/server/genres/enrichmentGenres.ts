import type { TrackGenre } from "@/types/track";
import type { GenreRow } from "@/server/repositories/genreRepository";
import type { ReleaseGenreCount } from "@/server/repositories/trackGenreRepository";
import { normalizeGenreName } from "@/lib/genres/normalization";

/** A genre the model may pick: a taxonomy entry with its usage. */
export type GenreChoice = TrackGenre & { track_count: number };

/** What the rest of the release says about genre, for the prompt (#374). */
export type AlbumGenreContext = {
  albumGenres: string[];
  albumStyles: string[];
  releaseGenres: ReleaseGenreCount[];
};

export const MAX_SUGGESTED_GENRES = 3;
export const MAX_SUGGESTED_DESCRIPTORS = 3;

// OpenAI's structured outputs allow 1,000 enum values per schema and, once a
// single enum passes 250 values, 15,000 characters across them. The seeded
// taxonomy is ~440 names in ~4,400 characters; the margin is for custom
// genres, and for the schema's other enum.
const MAX_ENUM_VALUES = 900;
const MAX_ENUM_CHARS = 14_000;

/** Flat taxonomy rows as choices, each carrying its parent's name. */
export function toGenreChoices(rows: GenreRow[]): GenreChoice[] {
  const names = new Map(rows.map((row) => [row.id, row.name]));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    parent_id: row.parent_id,
    parent_name: row.parent_id ? (names.get(row.parent_id) ?? null) : null,
    track_count: row.track_count,
  }));
}

/**
 * The genre names to offer the model as an enum, sorted so the schema is
 * stable between calls. Every taxonomy name fits today. If custom genres ever
 * push it past the provider's limits, the album's own genres are kept first and
 * then the most used — a track is likelier to be one of those than the tail.
 */
export function genreEnumNames(choices: GenreChoice[], context?: AlbumGenreContext): string[] {
  const preferred = new Set(
    [
      ...(context?.albumGenres ?? []),
      ...(context?.albumStyles ?? []),
      ...(context?.releaseGenres ?? []).map((genre) => genre.name),
    ].map(normalizeGenreName)
  );
  const ranked = [...choices].sort(
    (a, b) =>
      Number(preferred.has(normalizeGenreName(b.name))) -
        Number(preferred.has(normalizeGenreName(a.name))) ||
      b.track_count - a.track_count ||
      a.name.localeCompare(b.name)
  );

  const names: string[] = [];
  let chars = 0;
  for (const choice of ranked) {
    if (names.length >= MAX_ENUM_VALUES || chars + choice.name.length > MAX_ENUM_CHARS) break;
    names.push(choice.name);
    chars += choice.name.length;
  }
  return names.sort((a, b) => a.localeCompare(b));
}

/** Prompt lines describing the album, or none when nothing is known. */
export function albumContextLines(context: AlbumGenreContext): string[] {
  const lines: string[] = [];
  if (context.albumGenres.length > 0) {
    lines.push(`Album Discogs genres: ${context.albumGenres.join(", ")}`);
  }
  if (context.albumStyles.length > 0) {
    lines.push(`Album Discogs styles: ${context.albumStyles.join(", ")}`);
  }
  if (context.releaseGenres.length > 0) {
    const used = context.releaseGenres
      .map((genre) => `${genre.name} (${genre.track_count})`)
      .join(", ");
    lines.push(`Track genres already used on this album: ${used}`);
  }
  return lines;
}

/**
 * Maps the model's genre names back to taxonomy entries. The enum should make
 * an unknown name impossible, but the fallback paths parse free text, so
 * anything that is not a taxonomy name is dropped here rather than trusted.
 */
export function resolveSuggestedGenres(names: unknown, choices: GenreChoice[]): TrackGenre[] {
  if (!Array.isArray(names)) return [];
  const byName = new Map(choices.map((choice) => [normalizeGenreName(choice.name), choice]));
  const picked = new Map<string, TrackGenre>();
  for (const name of names) {
    if (typeof name !== "string") continue;
    const choice = byName.get(normalizeGenreName(name));
    if (!choice || picked.has(choice.id)) continue;
    const { id, name: canonical, slug, parent_id, parent_name } = choice;
    picked.set(id, { id, name: canonical, slug, parent_id, parent_name });
  }
  return [...picked.values()].slice(0, MAX_SUGGESTED_GENRES);
}
