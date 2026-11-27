"use client";

import { useQuery } from "@tanstack/react-query";
import { useHousehold } from "@/providers/HouseholdProvider";
import { queryKeys } from "@/lib/queryKeys";
import { fetchIntegrationStatus } from "@/services/internalApi/settings";

/**
 * Which optional keys are configured (#1279). Owner only, as the route is: for
 * anyone else the query never runs and `isOwner` is false, so a notice built on
 * it stays hidden under household profiles (#569).
 */
export function useIntegrationStatus() {
  const { data: household } = useHousehold();
  const isOwner = Boolean(household?.current?.is_owner);
  const query = useQuery({
    queryKey: queryKeys.integrations(),
    queryFn: fetchIntegrationStatus,
    enabled: isOwner,
    staleTime: 60_000,
  });
  return { isOwner, status: query.data, error: query.error, isLoading: query.isLoading };
}
