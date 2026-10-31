"use client";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getHome, type HomeQuery } from "@/services/internalApi/home";
export function useHomeQuery(
  params: HomeQuery,
  options?: { enabled?: boolean; staleTime?: number },
) {
  const query = useQuery({
    queryKey: queryKeys.home(params),
    queryFn: () => getHome(params),
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 30_000,
  });
  return { ...query, home: query.data ?? null };
}
