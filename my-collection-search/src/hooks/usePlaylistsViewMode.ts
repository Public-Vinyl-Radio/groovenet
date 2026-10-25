"use client";

import { useCallback, useEffect, useState } from "react";

export type PlaylistsViewMode = "cards" | "list";

/** localStorage key for the Playlists page's Cards/List choice (per device). */
export const PLAYLISTS_VIEW_MODE_KEY = "playlistsViewMode";

/** The Cards/List choice for the Playlists page, remembered on this device. */
export function usePlaylistsViewMode() {
  const [viewMode, setViewModeState] = useState<PlaylistsViewMode>("cards");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PLAYLISTS_VIEW_MODE_KEY);
      if (saved === "cards" || saved === "list") setViewModeState(saved);
    } catch {
      // Storage blocked: keep the default.
    }
  }, []);

  const setViewMode = useCallback((mode: PlaylistsViewMode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem(PLAYLISTS_VIEW_MODE_KEY, mode);
    } catch {
      // The choice still applies for this visit.
    }
  }, []);

  return { viewMode, setViewMode };
}
