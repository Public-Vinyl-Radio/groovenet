import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { Track } from "@/types/track";
import { useTrackStore } from "@/stores/trackStore";
import { exportPlaylistToPDF } from "@/lib/exportPlaylistPdf";
import { getTrackDurationSeconds } from "@/lib/trackUtils";
import { analytics } from "@/lib/analytics/client";

/**
 * Hook for playlist export and utility actions
 * Works with query-based playlist data
 */
export function usePlaylistActions(playlistId?: number) {
  const queryClient = useQueryClient();
  const { getTrack } = useTrackStore();

  // Get tracks from track store
  const getTracks = (): Track[] => {
    if (!playlistId) return [];

    const cached = queryClient.getQueryData(
      queryKeys.playlistTrackIds(playlistId)
    ) as
      | { track_id: string; friend_id: number }[]
      | { tracks?: { track_id: string; friend_id: number }[] }
      | undefined;

    const tracksPlaylist = Array.isArray(cached)
      ? cached
      : cached?.tracks ?? [];

    if (!Array.isArray(tracksPlaylist) || tracksPlaylist.length === 0) {
      return [];
    }

    const tracks = tracksPlaylist
      .map((t) => {
        return getTrack(t.track_id, t.friend_id);
      })
      .filter(Boolean) as Track[];

    return tracks;
  };

  // Calculate total playtime
  const getTotalPlaytime = (): { seconds: number; formatted: string; missingCount: number } => {
    const tracks = getTracks();
    let missingCount = 0;
    const totalSeconds = tracks.reduce((sum, track) => {
      const d = getTrackDurationSeconds(track);
      if (d === null) missingCount++;
      return sum + (d || 0);
    }, 0);

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let formatted = "";
    if (hours > 0) {
      formatted = `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`;
    } else {
      formatted = `${minutes}:${seconds.toString().padStart(2, "0")}`;
    }

    return { seconds: totalSeconds, formatted, missingCount };
  };

  // Export playlist as JSON
  const exportPlaylist = () => {
    console.log("Exporting playlist as JSON");
    const tracks = getTracks();
    console.log(`Playlist has ${tracks.length} tracks`);
    if (tracks.length === 0) return;

    // Get playlist name
    let playlistName: string | undefined;
    if (playlistId) {
      const cached = queryClient.getQueryData(
        queryKeys.playlistTrackIds(playlistId)
      ) as
        | { track_id: string; friend_id: number; playlist_name?: string }[]
        | { tracks?: { track_id: string; friend_id: number }[]; playlist_name?: string }
        | undefined;

      playlistName = !Array.isArray(cached) ? cached?.playlist_name : undefined;
    }

    // Export tracks with username for cross-installation compatibility
    // Exclude vector/embedding fields and computed fields from export
    const exportTracks = tracks.map((t) => {
      const trackData = { ...t } as Partial<Track> & Record<string, unknown>;
      delete trackData.embedding;
      delete trackData._vectors;
      delete trackData._semanticScore;
      delete trackData.hasVectors;
      return {
        ...trackData,
        // Ensure track_id and username are present for cross-installation compatibility
        track_id: t.track_id,
        username: t.username,
      };
    });

    const playlistData = {
      name: playlistName,
      tracks: exportTracks,
      exportDate: new Date().toISOString(),
      totalTracks: tracks.length,
      ...getTotalPlaytime(),
    };

    const blob = new Blob([JSON.stringify(playlistData, null, 2)], {
      type: "application/json",
    });

    // Create sanitized filename with playlist name and timestamp
    const exportedAt = new Date();
    const safeName = (playlistName || "playlist")
      .toString()
      .trim()
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
    const timestamp = exportedAt
      .toISOString()
      .replace(/[:]/g, "-")
      .replace(/\..+/, "")
      .replace("T", "_");

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    analytics.track("playlist_exported", {
      playlist_id: playlistId,
      track_count: tracks.length,
      export_format: "json",
    });
  };

  // Export playlist as PDF
  const exportToPDF = async (playlistName?: string) => {
    const tracks = getTracks();
    const { formatted: totalPlaytimeFormatted } = getTotalPlaytime();
    const exportedAt = new Date();
    const exportedAtLabel = exportedAt.toLocaleString();
    const safeName = (playlistName || "playlist")
      .toString()
      .trim()
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
    const timestamp = exportedAt
      .toISOString()
      .replace(/[:]/g, "-")
      .replace(/\..+/, "")
      .replace("T", "_");

    await exportPlaylistToPDF({
      playlist: tracks,
      totalPlaytimeFormatted,
      playlistName,
      exportedAt: exportedAtLabel,
      filename: `${safeName || "playlist"}-${timestamp}.pdf`,
    });

    analytics.track("playlist_exported", {
      playlist_id: playlistId,
      track_count: tracks.length,
      export_format: "pdf",
    });
  };

  return {
    getTracks,
    getTotalPlaytime,
    exportPlaylist,
    exportToPDF,
  };
}
