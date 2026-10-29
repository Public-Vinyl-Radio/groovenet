import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/queryKeys";
import { fetchStatusInfo, fetchUpdateInfo, fetchVersionInfo } from "@/services/internalApi/system";

export function useVersionInfo() {
  return useQuery({
    queryKey: queryKeys.version(),
    queryFn: fetchVersionInfo,
    staleTime: Infinity, // build info doesn't change while the app runs
  });
}

export function useStatusInfo() {
  return useQuery({
    queryKey: queryKeys.status(),
    queryFn: fetchStatusInfo,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useUpdateInfo() {
  return useQuery({
    queryKey: queryKeys.updateCheck(),
    queryFn: fetchUpdateInfo,
    staleTime: 60 * 60_000, // upstream is cached ~1h; no need to poll faster
  });
}
