import type { Track } from "@/types/track";
import { describeMix, parseBpm } from "@/lib/mixCompat";

export type SuggestionCandidate = Track & {
  _score?: number;
  _sources?: string[];
  _simIdentity?: number | null;
  _simAudio?: number | null;
  distance?: number;
};

export type SuggestionFilters = { compatibleKey?: boolean; bpmWithinSixPercent?: boolean };
export type SuggestionSeedMode = "track" | "playlist";
export type FoldGroup<T extends SuggestionCandidate> = { release: string; tracks: T[] };
export type RankedSuggestions<T extends SuggestionCandidate> = {
  tracks: T[];
  folds: FoldGroup<T>[];
  hiddenByFilters: number;
};

/** Keep ranking adjustments together so callers share the same ordering. */
export const SUGGESTION_RANK_WEIGHTS = {
  sameKey: 0.02,
  adjacentKey: 0.01,
  closestBpm: 0.01,
} as const;

const identity = (track: Pick<Track, "track_id" | "friend_id">) =>
  `${track.track_id}:${track.friend_id}`;
const releaseOf = (track: Track) => {
  const artist = track.artist?.trim().toLowerCase();
  const album = track.album?.trim().toLowerCase();
  return artist && album ? `${track.friend_id}:${artist}:${album}` : identity(track);
};

/** Blend recommendation and neighbour sources, merging duplicate tracks by their best score. */
export function blendSuggestionSources<T extends SuggestionCandidate>(
  sources: Array<{
    name: string;
    tracks: T[];
    score: (track: T, index: number, count: number) => number;
  }>,
): T[] {
  const byId = new Map<string, T>();
  for (const source of sources) {
    source.tracks.forEach((track, index) => {
      const id = identity(track);
      const score = source.score(track, index, source.tracks.length);
      const existing = byId.get(id);
      if (!existing) byId.set(id, { ...track, _sources: [source.name], _score: score });
      else {
        existing._score = Math.max(existing._score!, score);
        existing._sources = Array.from(new Set([...existing._sources!, source.name]));
      }
    });
  }
  return [...byId.values()];
}

export function rankSuggestions<T extends SuggestionCandidate>(
  candidates: T[],
  options: {
    seed: Track;
    playlist?: Track[];
    filters?: SuggestionFilters;
    seedMode?: SuggestionSeedMode;
    varietyCap?: number;
  },
): RankedSuggestions<T> {
  const { playlist = [], filters = {}, seedMode = "track", varietyCap = 1 } = options;
  const seed = seedMode === "playlist" ? (playlist.at(-1) ?? options.seed) : options.seed;
  const excluded = new Set([identity(options.seed), ...playlist.map(identity)]);
  const eligible = candidates.filter((candidate) => !excluded.has(identity(candidate)));
  const passes = (candidate: T) => {
    const mix = describeMix(seed, candidate);
    if (filters.compatibleKey && mix.keyRelation !== null && mix.keyRelation === "clash")
      return false;
    const baseBpm = parseBpm(seed.bpm);
    const candidateBpm = parseBpm(candidate.bpm);
    if (
      filters.bpmWithinSixPercent &&
      baseBpm !== null &&
      candidateBpm !== null &&
      Math.abs(candidateBpm - baseBpm) / baseBpm > 0.06
    )
      return false;
    return true;
  };
  const filtered = eligible.filter(passes);
  const hiddenByFilters = eligible.length - filtered.length;
  const score = (candidate: T) => {
    const base =
      candidate._score ??
      candidate._semanticScore ??
      Math.max(candidate._simIdentity ?? 0, candidate._simAudio ?? 0);
    const mix = describeMix(seed, candidate);
    const keyBoost =
      mix.keyRelation === "same"
        ? SUGGESTION_RANK_WEIGHTS.sameKey
        : mix.keyRelation === "adjacent"
          ? SUGGESTION_RANK_WEIGHTS.adjacentKey
          : 0;
    const baseBpm = parseBpm(seed.bpm);
    const candidateBpm = parseBpm(candidate.bpm);
    const bpmBoost =
      baseBpm && candidateBpm
        ? Math.max(0, 1 - Math.abs(candidateBpm - baseBpm) / baseBpm) *
          SUGGESTION_RANK_WEIGHTS.closestBpm
        : 0;
    return base + keyBoost + bpmBoost;
  };
  const sorted = [...filtered].sort((a, b) => score(b) - score(a));
  const counts = new Map<string, number>();
  const tracks: T[] = [];
  const folds = new Map<string, FoldGroup<T>>();
  for (const candidate of sorted) {
    const release = releaseOf(candidate);
    const count = counts.get(release) ?? 0;
    counts.set(release, count + 1);
    if (count < varietyCap) tracks.push(candidate);
    else {
      const group = folds.get(release) ?? {
        release: candidate.album,
        tracks: [],
      };
      group.tracks.push(candidate);
      folds.set(release, group);
    }
  }
  return { tracks, folds: [...folds.values()], hiddenByFilters };
}
