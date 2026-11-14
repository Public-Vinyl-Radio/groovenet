import type { RankingConfig, RankingSurface } from "@groovenet/contracts";
import type { Track } from "@/types/track";
import {
  DEFAULT_CONFIG_BY_SURFACE,
  DEFAULT_RANKING_CONFIG,
  withSuggestionFilters,
  type SuggestionFilterToggles,
} from "@/lib/ranking/configs";
import { rankingCandidateFromTrack, rankingTrackFromTrack } from "@/lib/ranking/features";
import { defaultRanker, orderByRanking } from "@/lib/ranking/ranker";
import { KEY_RELATION_VALUE } from "@/lib/ranking/signals";

export type SuggestionCandidate = Track & {
  _score?: number;
  _sources?: string[];
  _simIdentity?: number | null;
  _simAudio?: number | null;
  distance?: number;
};

export type SuggestionFilters = SuggestionFilterToggles;
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

/** Today's key and tempo boosts, read from the default ranking config. */
export const SUGGESTION_RANK_WEIGHTS = {
  sameKey: (DEFAULT_RANKING_CONFIG.weights.key_relation ?? 0) * KEY_RELATION_VALUE.same,
  adjacentKey: (DEFAULT_RANKING_CONFIG.weights.key_relation ?? 0) * KEY_RELATION_VALUE.adjacent,
  closestBpm: DEFAULT_RANKING_CONFIG.weights.bpm_distance ?? 0,
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
    /** The ranking config; omitted, the surface's default (today's ranking). */
    config?: RankingConfig;
    surface?: Extract<RankingSurface, "suggestions" | "related">;
  },
): RankedSuggestions<T> {
  const {
    playlist = [],
    filters = {},
    seedMode = "track",
    varietyCap = 1,
    surface = "suggestions",
  } = options;
  const config = options.config ?? DEFAULT_CONFIG_BY_SURFACE[surface];
  const seed = seedMode === "playlist" ? (playlist.at(-1) ?? options.seed) : options.seed;
  const excluded = new Set([identity(options.seed), ...playlist.map(identity)]);
  const eligible = candidates.filter((candidate) => !excluded.has(identity(candidate)));
  const rankings = defaultRanker.rank({
    seed: { track: rankingTrackFromTrack(seed) },
    candidates: eligible.map(rankingCandidateFromTrack),
    context: { surface, friendId: seed.friend_id },
    config: withSuggestionFilters(config, filters),
  });
  const sorted = orderByRanking(eligible, rankings);
  const hiddenByFilters = eligible.length - sorted.length;
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
