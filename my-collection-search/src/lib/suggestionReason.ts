import type { Track } from "@/types/track";

export type SuggestionReason =
  { kind: "album" } | { kind: "artist" } | { kind: "sound" } | { kind: "genre"; name: string };

type GenreRef = { name: string; slug?: string | null };

export type ReasonSeed = Pick<Track, "artist" | "album" | "release_id" | "friend_id"> & {
  track_genres?: GenreRef[];
};

export type ReasonCandidate = Pick<Track, "artist" | "album" | "release_id" | "friend_id"> & {
  track_genres?: GenreRef[];
  _simIdentity?: number | null;
  _simAudio?: number | null;
};

const norm = (value: string | null | undefined): string => (value ?? "").trim().toLowerCase();

function sameAlbum(seed: ReasonSeed, candidate: ReasonCandidate): boolean {
  if (seed.release_id && candidate.release_id) {
    return seed.release_id === candidate.release_id && seed.friend_id === candidate.friend_id;
  }
  const album = norm(seed.album);
  return (
    album !== "" && album === norm(candidate.album) && norm(seed.artist) === norm(candidate.artist)
  );
}

/**
 * The strongest reason a candidate is suggested after a seed, or null when it
 * has none. Precedence: same album, same artist, similar sound (audio
 * similarity), then a shared reconciled genre.
 */
export function suggestionReason(
  seed: ReasonSeed,
  candidate: ReasonCandidate,
): SuggestionReason | null {
  if (sameAlbum(seed, candidate)) return { kind: "album" };
  const artist = norm(seed.artist);
  if (artist !== "" && artist === norm(candidate.artist)) return { kind: "artist" };
  if (candidate._simAudio != null) return { kind: "sound" };
  const seedSlugs = new Set((seed.track_genres ?? []).flatMap((g) => (g.slug ? [g.slug] : [])));
  const shared = (candidate.track_genres ?? []).find((g) => g.slug && seedSlugs.has(g.slug));
  return shared ? { kind: "genre", name: shared.name } : null;
}

export function suggestionReasonLabel(reason: SuggestionReason): string {
  switch (reason.kind) {
    case "album":
      return "Same album";
    case "artist":
      return "Same artist";
    case "sound":
      return "Similar sound";
    case "genre":
      return `Genre: ${reason.name}`;
  }
}
