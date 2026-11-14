"use client";

// Suggestion analytics (#1185), shared by the track page and the playlist's
// Suggestions panel so both describe a list and an action the same way.

import { useEffect, useRef } from "react";
import { analytics } from "@/lib/analytics/client";
import type {
  AnalyticsEvents,
  SuggestionSource,
  SuggestionSurface,
  TrackMenuAction,
} from "@/lib/analytics/events";
import { describeMix } from "@/lib/mixCompat";
import type { SuggestionCandidate } from "@/lib/rankSuggestions";
import type { Track } from "@/types/track";

/** The similarity lists that found a candidate, from the scores it carries. */
export function suggestionSources(candidate: SuggestionCandidate): SuggestionSource[] {
  const sources: SuggestionSource[] = [];
  if (candidate._simIdentity != null) sources.push("identity");
  if (candidate._simAudio != null) sources.push("audio");
  return sources;
}

export type SuggestionContext = {
  surface: SuggestionSurface;
  /** The single track the list follows; null for a whole-playlist list. */
  seedTrackId: string | null;
};

/** Record a suggestion played, queued or added. */
export function trackSuggestionAction(
  context: SuggestionContext,
  {
    seed,
    item,
    action,
  }: {
    /** The track the row's key and BPM are read against. */
    seed: Pick<Track, "bpm" | "key">;
    item: { track: SuggestionCandidate; rank: number; fromFold: boolean };
    action: TrackMenuAction;
  },
) {
  const { track } = item;
  analytics.track("recommendation_acted_on", {
    track_id: track.track_id,
    action,
    rank: item.rank,
    sources: suggestionSources(track),
    surface: context.surface,
    seed_track_id: context.seedTrackId,
    from_fold: item.fromFold,
    sim_identity: track._simIdentity ?? null,
    sim_audio: track._simAudio ?? null,
    key_relation: describeMix(seed, track).keyRelation ?? "unknown",
  });
}

/** Record "show more" or a fold opened, with the rows shown once it has. */
export function trackSuggestionsExpanded(
  context: SuggestionContext,
  kind: AnalyticsEvents["suggestions_expanded"]["kind"],
  depth: number,
) {
  analytics.track("suggestions_expanded", {
    surface: context.surface,
    seed_track_id: context.seedTrackId,
    kind,
    depth,
  });
}

type ShownList = {
  /** False until the list on screen is the loaded one. */
  loaded: boolean;
  /** What a load is of: the seeds and scope. A new key is a new load. */
  listKey: string;
  scope: AnalyticsEvents["suggestions_shown"]["scope"];
  compatibleKey: boolean;
  bpmWithinSixPercent: boolean;
  shownCount: number;
  hiddenByFilters: number;
};

/**
 * Send `suggestions_shown` once per list load, and again when a filter
 * changes the loaded list. Paging, folds and actions never re-send it.
 */
export function useSuggestionsShown(context: SuggestionContext, list: ShownList) {
  const last = useRef<{ listKey: string; filters: string } | null>(null);
  const { surface, seedTrackId } = context;
  const { loaded, listKey, scope, compatibleKey, bpmWithinSixPercent } = list;
  const { shownCount, hiddenByFilters } = list;
  useEffect(() => {
    if (!loaded) return;
    const filters = `${compatibleKey}:${bpmWithinSixPercent}`;
    const previous = last.current;
    if (previous && previous.listKey === listKey && previous.filters === filters) return;
    last.current = { listKey, filters };
    analytics.track("suggestions_shown", {
      surface,
      seed_track_id: seedTrackId,
      trigger: previous?.listKey === listKey ? "filter_change" : "load",
      shown_count: shownCount,
      scope,
      compatible_key: compatibleKey,
      bpm_within_6pct: bpmWithinSixPercent,
      hidden_by_filters: hiddenByFilters,
    });
  }, [
    loaded,
    listKey,
    scope,
    compatibleKey,
    bpmWithinSixPercent,
    shownCount,
    hiddenByFilters,
    surface,
    seedTrackId,
  ]);
}
