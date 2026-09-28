"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import {
  createSpin,
  deleteSpin,
  listSpins,
  listTopSpinTracks,
  type SpinCreateParams,
  type SpinCreateResponse,
  type SpinListParams,
  type SpinListResponse,
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

export function useSpinTopTracksQuery(
  params: SpinTopTracksParams,
  options?: UseSpinsOptions
) {
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
    /** The spin being deleted right now, so only its row shows as busy. */
    deletingSpinId: deleteSpinMutation.isPending ? deleteSpinMutation.variables : undefined,
  };
}
