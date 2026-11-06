"use client";

import { useCallback, useEffect, useState } from "react";
import { useBreakpointValue } from "@chakra-ui/react";

export type TrackViewMode = "row" | "card";

/** localStorage key shared by every track list that offers Rows/Cards. */
export const TRACK_VIEW_MODE_KEY = "searchViewMode";

/**
 * The Rows/Cards choice for a track list, persisted so it carries over between
 * lists. `viewMode` is the saved choice (what the toggle shows); `layout` is
 * what to render: phones always get cards.
 */
export function useTrackViewMode({
  storageKey = TRACK_VIEW_MODE_KEY,
  defaultMode = "row",
  phonesAlwaysCards = true,
}: {
  /** A list with its own remembered choice (Chores' pulled stack). */
  storageKey?: string;
  defaultMode?: TrackViewMode;
  /** Off for a list whose rows still work on a phone. */
  phonesAlwaysCards?: boolean;
} = {}) {
  const [viewMode, setViewModeState] = useState<TrackViewMode>(defaultMode);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "row" || saved === "card") setViewModeState(saved);
    } catch {
      // Storage blocked: keep the default.
    }
  }, [storageKey]);

  const setViewMode = useCallback(
    (mode: TrackViewMode) => {
      setViewModeState(mode);
      try {
        localStorage.setItem(storageKey, mode);
      } catch {
        // The choice still applies for this visit.
      }
    },
    [storageKey],
  );

  const isMobile = useBreakpointValue({ base: true, md: false }) ?? true;
  const layout: TrackViewMode = isMobile && phonesAlwaysCards ? "card" : viewMode;

  return { viewMode, setViewMode, layout, isMobile };
}
