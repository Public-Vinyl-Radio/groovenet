"use client";

import React from "react";
import { toaster } from "@/components/ui/toaster";
import {
  createSetForPlaylist,
  fetchLiveSet,
  type LiveSetDetail,
} from "@/services/internalApi/playlists";

/**
 * A playlist's set, if it is one yet. Shared by the playlist page's actions
 * menu ("Create set") and `SetDetailsPanel`, so creating a set from the menu
 * shows its details at once.
 */
export function useLiveSet(playlistId?: number) {
  const [set, setSet] = React.useState<LiveSetDetail | null>(null);
  const [loading, setLoading] = React.useState(Boolean(playlistId));

  const load = React.useCallback(async () => {
    if (!playlistId) return;
    try {
      setSet(await fetchLiveSet(playlistId));
    } catch {
      setSet(null);
    } finally {
      setLoading(false);
    }
  }, [playlistId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const create = React.useCallback(async () => {
    if (!playlistId) return;
    try {
      await createSetForPlaylist(playlistId);
      await load();
    } catch {
      toaster.create({ title: "Could not create set", type: "error" });
    }
  }, [playlistId, load]);

  return { set, setSet, loading, load, create };
}

export type LiveSetState = ReturnType<typeof useLiveSet>;
