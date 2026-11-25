// hooks/useDiscogsQuery.ts
"use client";
import { useMutation } from "@tanstack/react-query";

// The sync itself is a background job since #1274: `useDiscogsImports`.
import {
  verifyManifests,
  cleanupManifests,
  deleteReleases,
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
