import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCookieStatus,
  uploadCookieFile,
  deleteCookieFile,
  type UploadCookieResponse,
} from "@/services/internalApi/cookies";
import type { CookieFileInfo } from "@/types/gamdl";

const COOKIE_QUERY_KEY = ["gamdl-cookies"];

/**
 * Hook for getting cookie file status
 */
export function useCookieStatus() {
  return useQuery({
    queryKey: COOKIE_QUERY_KEY,
    queryFn: getCookieStatus,
    refetchInterval: 30000, // Refetch every 30 seconds to check for updates
  });
}

/**
 * Hook for uploading cookie files
 */
export function useUploadCookie() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: uploadCookieFile,
    onSuccess: (data: UploadCookieResponse) => {
      // Update the cache with the new cookie info
      queryClient.setQueryData(COOKIE_QUERY_KEY, data.cookieInfo);
      // Also invalidate to ensure fresh data
      queryClient.invalidateQueries({ queryKey: COOKIE_QUERY_KEY });
    },
    onError: (error) => {
      console.error("Failed to upload cookie file:", error);
    },
  });
}

/**
 * Hook for deleting cookie files
 */
export function useDeleteCookie() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCookieFile,
    onSuccess: () => {
      // Update the cache to reflect deleted state
      queryClient.setQueryData(COOKIE_QUERY_KEY, {
        exists: false,
        isValid: false,
        validationErrors: ["No cookie file found"],
      } as CookieFileInfo);
      // Also invalidate to ensure fresh data
      queryClient.invalidateQueries({ queryKey: COOKIE_QUERY_KEY });
    },
    onError: (error) => {
      console.error("Failed to delete cookie file:", error);
    },
  });
}
