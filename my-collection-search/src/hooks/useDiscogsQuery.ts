// hooks/useDiscogsQuery.ts
"use client";
import { useMutation } from "@tanstack/react-query";

import { useSettingsDialogs } from "@/providers/SettingsDialogProvider";
import { useSyncStreams } from "@/providers/SyncStreamsProvider";
import {
  syncDiscogsStream,
  verifyManifests,
  cleanupManifests,
  deleteReleases,
  type SyncResult,
  type ManifestVerificationResponse,
  type ManifestCleanupResponse,
  type DeleteReleasesResponse,
} from "@/services/internalApi/discogs";

/** 2) Verify manifests */
export function useVerifyManifests() {
  return useMutation<ManifestVerificationResponse, Error, void>({
    mutationFn: () => verifyManifests(),
  });
}

/** 3) Cleanup manifests */
export function useCleanupManifests() {
  return useMutation<ManifestCleanupResponse, Error, void>({
    mutationFn: () => cleanupManifests(),
  });
}

/** 4) Delete releases */
export function useDeleteReleases() {
  return useMutation<DeleteReleasesResponse, Error, { username: string; releaseIds: string[] }>({
    mutationFn: ({ username, releaseIds }) => deleteReleases(username, releaseIds),
  });
}

/** 5) Streaming mutation for sync */
export function useSyncDiscogs(
  onRemovedReleases?: (data: { removedIds: string[]; username: string }) => void,
) {
  const { setDiscogsSyncOpen } = useSettingsDialogs();
  const { resetDiscogs, pushDiscogsLine, setDiscogsDone, setDiscogsError } = useSyncStreams();

  return useMutation<SyncResult | null, Error, { username?: string }>({
    mutationFn: async ({ username }) => {
      resetDiscogs();
      setDiscogsSyncOpen(true);

      let summary: SyncResult | null = null;

      try {
        await syncDiscogsStream(username, (line: string) => {
          pushDiscogsLine(line);

          // detect REMOVED_RELEASES message
          if (line.startsWith("REMOVED_RELEASES:")) {
            try {
              const jsonStr = line.replace("REMOVED_RELEASES:", "");
              const data = JSON.parse(jsonStr);
              if (onRemovedReleases && data.removedIds.length > 0) {
                // Close sync dialog temporarily to show removed releases dialog
                setDiscogsSyncOpen(false);
                // Small delay to ensure dialog closes before new one opens
                setTimeout(() => {
                  onRemovedReleases(data);
                }, 100);
              }
            } catch (e) {
              console.error("Failed to parse REMOVED_RELEASES:", e);
            }
          }

          // detect JSON summary on any line
          try {
            const obj = JSON.parse(line);
            if (obj && (obj.newReleases || obj.alreadyHave)) summary = obj as SyncResult;
          } catch {}
        });
        setDiscogsDone(true);
        return summary;
      } catch (e: unknown) {
        setDiscogsError(e instanceof Error ? e.message : String(e));
        setDiscogsDone(true);
        throw e;
      }
    },
  });
}
