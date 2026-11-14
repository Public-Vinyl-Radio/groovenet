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
/** Folded release siblings: `key` is the release's identity, `release` its album title for display. */
export type FoldGroup<T extends SuggestionCandidate> = {
  key: string;
  release: string;
  tracks: T[];
};
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
export const releaseOf = (track: Track) => {
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
        key: release,
        release: candidate.album,
        tracks: [],
      };
      group.tracks.push(candidate);
      folds.set(release, group);
    }
  }
  return { tracks, folds: [...folds.values()], hiddenByFilters };
}

export type SuggestionListItem<T extends SuggestionCandidate> =
  | {
      kind: "track";
      track: T;
      /** 1-based position among the rows on screen. */
      rank: number;
      /** Shown by expanding its release's fold, not ranked onto the page. */
      fromFold: boolean;
    }
  | { kind: "fold"; fold: FoldGroup<T> };

export type SuggestionLayout<T extends SuggestionCandidate> = {
  items: SuggestionListItem<T>[];
  /** Track rows on screen. */
  shown: number;
  /** Ranked rows plus the tracks of every expanded release. */
  total: number;
  /** Ranked rows still past the page limit. */
  remaining: number;
};

/**
 * Turn ranked suggestions into the rows and folds a list draws. The page limit
 * counts ranked rows only. Each release's fold sits under the last visible row
 * of that release, or stays hidden until one is visible; an expanded release's
 * tracks take the fold's place, so expanding never pushes them off the page.
 */
export function layoutSuggestions<T extends SuggestionCandidate>(
  ranked: Pick<RankedSuggestions<T>, "tracks" | "folds">,
  { expanded, limit }: { expanded: readonly string[]; limit: number },
): SuggestionLayout<T> {
  const visible = ranked.tracks.slice(0, Math.max(0, limit));
  const folds = new Map(ranked.folds.map((fold) => [fold.key, fold]));
  const lastOfRelease = new Map<string, number>();
  visible.forEach((track, index) => {
    const release = releaseOf(track);
    if (folds.has(release)) lastOfRelease.set(release, index);
  });
  const items: SuggestionListItem<T>[] = [];
  let rank = 0;
  visible.forEach((track, index) => {
    items.push({ kind: "track", track, rank: ++rank, fromFold: false });
    const release = releaseOf(track);
    if (lastOfRelease.get(release) !== index) return;
    const fold = folds.get(release)!;
    if (expanded.includes(fold.key)) {
      for (const sibling of fold.tracks)
        items.push({ kind: "track", track: sibling, rank: ++rank, fromFold: true });
    } else items.push({ kind: "fold", fold });
  });
  const expandedCount = ranked.folds
    .filter((fold) => expanded.includes(fold.key))
    .reduce((sum, fold) => sum + fold.tracks.length, 0);
  return {
    items,
    shown: rank,
    total: ranked.tracks.length + expandedCount,
    remaining: ranked.tracks.length - visible.length,
  };
}
