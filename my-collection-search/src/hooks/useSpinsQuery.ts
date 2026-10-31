"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import {
  createSpin,
  deleteSpin,
  getSpinRecap,
  listSpins,
  listTopSpinTracks,
  type SpinCreateParams,
  type SpinCreateResponse,
  type SpinListParams,
  type SpinListResponse,
  type SpinRecapParams,
  type SpinRecapResponse,
  type SpinTopTracksParams,
  type SpinTopTracksResponse,
  type SpinUpdateParams,
  type SpinUpdateResponse,
  updateSpin,
} from "@/services/internalApi/spins";

type UseSpinsOptions = {
  enabled?: boolean;
  staleTime?: number;
};

export function useSpinsQuery(params: SpinListParams, options?: UseSpinsOptions) {
  const query = useQuery<SpinListResponse, Error>({
    queryKey: queryKeys.spins({
      friend_id: params.friend_id,
      release_id: params.release_id,
      track_id: params.track_id,
      from: params.from,
      to: params.to,
      limit: params.limit,
      offset: params.offset,
      medium: params.medium,
    }),
    queryFn: () => listSpins(params),
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    ...query,
    spins: query.data?.items ?? [],
  };
}

type SpinsInfiniteParams = Omit<SpinListParams, "cursor" | "offset">;

/** Newest-first pages of spins for infinite scroll; `fetchNextPage` follows `next_cursor`. */
export function useSpinsInfiniteQuery(params: SpinsInfiniteParams, options?: UseSpinsOptions) {
  const query = useInfiniteQuery<
    SpinListResponse,
    Error,
    InfiniteData<SpinListResponse, string | undefined>,
    ReturnType<typeof queryKeys.spinsInfinite>,
    string | undefined
  >({
    queryKey: queryKeys.spinsInfinite({
      friend_id: params.friend_id,
      release_id: params.release_id,
      track_id: params.track_id,
      from: params.from,
      to: params.to,
      limit: params.limit,
      medium: params.medium,
    }),
    queryFn: ({ pageParam }) => listSpins({ ...params, offset: 0, cursor: pageParam }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    ...query,
    spins: query.data?.pages.flatMap((page) => page.items) ?? [],
  };
}

export function useSpinTopTracksQuery(params: SpinTopTracksParams, options?: UseSpinsOptions) {
  const query = useQuery<SpinTopTracksResponse, Error>({
    queryKey: queryKeys.spinTopTracks({
      friend_id: params.friend_id,
      release_id: params.release_id,
      limit: params.limit,
      offset: params.offset,
    }),
    queryFn: () => listTopSpinTracks(params),
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    ...query,
    topTracks: query.data?.items ?? [],
  };
}

/** One month's listening recap. */
export function useSpinRecapQuery(params: SpinRecapParams, options?: UseSpinsOptions) {
  const query = useQuery<SpinRecapResponse, Error>({
    queryKey: queryKeys.spinRecap({ friend_id: params.friend_id, month: params.month }),
    queryFn: () => getSpinRecap(params),
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    ...query,
    recap: query.data ?? null,
  };
}

export function useSpinMutations(friendId?: number) {
  const queryClient = useQueryClient();

  const invalidateSpins = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.spinsRoot() });
    await queryClient.invalidateQueries({ queryKey: queryKeys.spinTopTracksRoot() });
  };

  const createSpinMutation = useMutation<SpinCreateResponse, Error, SpinCreateParams>({
    mutationFn: createSpin,
    onSuccess: async () => {
      await invalidateSpins();
    },
  });

  const updateSpinMutation = useMutation<
    SpinUpdateResponse,
    Error,
    { spinId: number; changes: Omit<SpinUpdateParams, "friend_id"> }
  >({
    mutationFn: async ({ spinId, changes }) => {
      if (!friendId) throw new Error("friendId is required to edit a spin");
      return await updateSpin(spinId, { ...changes, friend_id: friendId });
    },
    onSuccess: async () => {
      await invalidateSpins();
    },
  });

  const deleteSpinMutation = useMutation({
    mutationFn: async (spinId: number) => {
      if (!friendId) throw new Error("friendId is required to delete a spin");
      return await deleteSpin(spinId, friendId);
    },
    onSuccess: async () => {
      await invalidateSpins();
    },
  });

  return {
    createSpin: (params: SpinCreateParams) => createSpinMutation.mutateAsync(params),
    updateSpin: (spinId: number, changes: Omit<SpinUpdateParams, "friend_id">) =>
      updateSpinMutation.mutateAsync({ spinId, changes }),
    deleteSpin: (spinId: number) => deleteSpinMutation.mutateAsync(spinId),
    createSpinPending: createSpinMutation.isPending,
    updateSpinPending: updateSpinMutation.isPending,
    deleteSpinPending: deleteSpinMutation.isPending,
  };
}
