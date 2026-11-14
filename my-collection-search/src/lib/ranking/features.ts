/**
 * The track features the ranker reads, and the adapters that build them from
 * a browser `Track` and from a server candidate's metadata. Pure: this module
 * runs in the browser (suggestions) and on the server (recommendations).
 */
import type { Track } from "@/types/track";
import type { GenreRef } from "@/lib/recommendation-candidate-retriever";

export type { GenreRef };

/** What the signals read from one side of a comparison. Missing data is null or absent. */
export type RankingTrack = {
  bpm?: number | string | null;
  key?: string | null;
  eraBucket?: string | null;
  genres?: GenreRef[];
  energy?: number | null;
  danceability?: number | null;
  /** The owner's star rating, 1-5; 0 or null is unrated. */
  rating?: number | null;
};

/** A candidate adds its retrieval similarities and, when it has one, a precomputed score. */
export type RankingCandidate = RankingTrack & {
  identity?: number | null;
  vibe?: number | null;
  /** A score from an earlier stage (a blended source, semantic search) that stands in for the base. */
  prior?: number | null;
};

/** Decade bucket from a release year; null when unknown or before 1900. */
export function computeEraBucket(year: string | null): string | null {
  if (!year) return null;

  const yearNum = parseInt(year, 10);
  if (isNaN(yearNum) || yearNum < 1900) return null;

  if (yearNum >= 2020) return "2020s";
  if (yearNum >= 2010) return "2010s";
  if (yearNum >= 2000) return "2000s";
  if (yearNum >= 1990) return "1990s";
  if (yearNum >= 1980) return "1980s";
  if (yearNum >= 1970) return "1970s";
  if (yearNum >= 1960) return "1960s";
  if (yearNum >= 1950) return "1950s";
  return "pre-1950s";
}

/** Energy from danceability and aggressive mood; null when both are unknown. */
export function calculateEnergy(
  danceability: number | null,
  moodAggressive: number | null,
): number | null {
  if (danceability === null && moodAggressive === null) return null;

  const dance = danceability ?? 0.5;
  const aggression = moodAggressive ?? 0.5;

  // Simple energy calculation (can be refined)
  return dance * 0.6 + aggression * 0.4;
}

function finiteOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

type TrackLike = Pick<Track, "bpm" | "key" | "year" | "star_rating" | "track_genres"> & {
  danceability?: number | string | null;
  mood_aggressive?: number | null;
};

/** A browser `Track` as ranker features. */
export function rankingTrackFromTrack(track: TrackLike): RankingTrack {
  const danceability = finiteOrNull(track.danceability);
  return {
    bpm: track.bpm,
    key: track.key,
    eraBucket: computeEraBucket(
      track.year === null || track.year === undefined ? null : String(track.year),
    ),
    genres: (track.track_genres ?? []).map((genre) => ({
      id: genre.id,
      parentId: genre.parent_id,
    })),
    energy: calculateEnergy(danceability, track.mood_aggressive ?? null),
    danceability,
    rating: track.star_rating ?? null,
  };
}

type SuggestionLike = TrackLike & {
  _score?: number;
  _semanticScore?: number;
  _simIdentity?: number | null;
  _simAudio?: number | null;
};

/** A suggestion candidate as ranker input: its features, similarities and any precomputed score. */
export function rankingCandidateFromTrack(track: SuggestionLike): RankingCandidate {
  return {
    ...rankingTrackFromTrack(track),
    identity: track._simIdentity ?? null,
    vibe: track._simAudio ?? null,
    prior: track._score ?? track._semanticScore ?? null,
  };
}

type CandidateMetadataLike = {
  bpm: number | null;
  key: string | null;
  eraBucket: string | null;
  genreRefs: GenreRef[];
  energy: number | null;
  danceability: number | null;
  starRating: number | null;
};

/** Server candidate metadata (`buildCandidateMetadata`) as ranker features. */
export function rankingTrackFromMetadata(metadata: CandidateMetadataLike): RankingTrack {
  return {
    bpm: metadata.bpm,
    key: metadata.key,
    eraBucket: metadata.eraBucket,
    genres: metadata.genreRefs,
    energy: metadata.energy,
    danceability: metadata.danceability,
    rating: metadata.starRating,
  };
}
