"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import {
  createRecordAction,
  createRecordCopy,
  deleteRecordCopy,
  discardRecordCareStack,
  getRecordCareProgress,
  getRecordCareQueue,
  getRecordCareSummary,
  listRecordActions,
  listRecordCare,
  listRecordCareLog,
  listRecordCareStacks,
  listRecordCopies,
  logRecordCareSession,
  pullRecordCareStack,
  updateDefaultRecordCopy,
  updateRecordCopy,
  voidRecordAction,
  voidRecordCareSession,
  type RecordActionCreateParams,
  type RecordActionListResponse,
  type RecordCareLogResponse,
  type RecordCareParams,
  type RecordCareProgressResponse,
  type RecordCareQueueResponse,
  type RecordCareResponse,
  type RecordCareSession,
  type RecordCareSessionCreate,
  type RecordCareSummaryResponse,
  type RecordCopyListItem,
  type RecordCopyListResponse,
} from "@/services/internalApi/recordCare";

// Copies and actions are not Track/Album entities, so React Query owns them
// outright (docs/state-ownership.md); nothing here touches a Zustand store.

type QueryOptions = { enabled?: boolean };

const STALE_TIME = 30_000;

/** A release's copies — its implicit default (`id: null`) if none are recorded. */
export function useRecordCopiesQuery(
  params: { friend_id: number; release_id: string },
  options?: QueryOptions,
) {
  const query = useQuery<RecordCopyListResponse, Error>({
    queryKey: queryKeys.recordCopies({
      friend_id: params.friend_id,
      release_id: params.release_id,
    }),
    queryFn: () => listRecordCopies(params),
    enabled: options?.enabled ?? true,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
  });
  return {
    ...query,
    copies: query.data?.items ?? [],
    overdueDays: query.data?.overdue_days,
  };
}

/** A copy's history. An implicit copy (`copyId` null) has none to fetch. */
export function useRecordActionsQuery(
  copyId: number | null,
  params: { friend_id: number; include_voided?: boolean },
  options?: QueryOptions,
) {
  const query = useQuery<RecordActionListResponse, Error>({
    queryKey: queryKeys.recordActions(copyId ?? 0, {
      friend_id: params.friend_id,
      include_voided: params.include_voided,
    }),
    queryFn: () => listRecordActions(copyId as number, { ...params, limit: 100 }),
    enabled: copyId !== null && (options?.enabled ?? true),
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
  });
  return { ...query, actions: query.data?.items ?? [] };
}

/** One page of copies needing care; the previous page stays up while the next loads. */
export function useRecordCareQuery(params: RecordCareParams, options?: QueryOptions) {
  const query = useQuery<RecordCareResponse, Error>({
    queryKey: queryKeys.recordCare({
      friend_id: params.friend_id,
      status: params.status,
      limit: params.limit,
      offset: params.offset,
    }),
    queryFn: () => listRecordCare(params),
    enabled: options?.enabled ?? true,
    staleTime: STALE_TIME,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
  return { ...query, items: query.data?.items ?? [] };
}

export function useRecordCareSummaryQuery(params: { friend_id: number }, options?: QueryOptions) {
  return useQuery<RecordCareSummaryResponse, Error>({
    queryKey: queryKeys.recordCareSummary({ friend_id: params.friend_id }),
    queryFn: () => getRecordCareSummary(params),
    enabled: options?.enabled ?? true,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
  });
}

export type CopyChanges = { label?: string | null; notes?: string | null };

export function useRecordCareMutations(friendId: number) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.recordCareRoot() });

  const addCopyMutation = useMutation({
    mutationFn: (input: { release_id: string } & CopyChanges) =>
      createRecordCopy({ friend_id: friendId, ...input }),
    onSuccess: invalidate,
  });

  // The default copy may be implicit, with no id yet; it is edited by release.
  const updateCopyMutation = useMutation({
    mutationFn: ({ copy, changes }: { copy: RecordCopyListItem; changes: CopyChanges }) =>
      copy.id === null
        ? updateDefaultRecordCopy({ friend_id: friendId, release_id: copy.release_id, ...changes })
        : updateRecordCopy(copy.id, { friend_id: friendId, ...changes }),
    onSuccess: invalidate,
  });

  const removeCopyMutation = useMutation({
    mutationFn: (copyId: number) => deleteRecordCopy(copyId, friendId),
    onSuccess: invalidate,
  });

  const logActionMutation = useMutation({
    mutationFn: (input: Omit<RecordActionCreateParams, "friend_id">) =>
      createRecordAction({ friend_id: friendId, ...input }),
    onSuccess: invalidate,
  });

  const voidActionMutation = useMutation({
    mutationFn: (actionId: number) => voidRecordAction(actionId, friendId),
    onSuccess: invalidate,
  });

  return {
    addCopy: addCopyMutation.mutateAsync,
    updateCopy: (copy: RecordCopyListItem, changes: CopyChanges) =>
      updateCopyMutation.mutateAsync({ copy, changes }),
    removeCopy: removeCopyMutation.mutateAsync,
    logAction: logActionMutation.mutateAsync,
    voidAction: voidActionMutation.mutateAsync,
    addCopyPending: addCopyMutation.isPending,
    updateCopyPending: updateCopyMutation.isPending,
    removeCopyPending: removeCopyMutation.isPending,
    logActionPending: logActionMutation.isPending,
    voidActionPending: voidActionMutation.isPending,
  };
}

/**
 * The chores queue (#943). `limit` is the backlog's length so far: "more" asks
 * for a longer page, and the shorter one stays up while it loads.
 */
export function useRecordCareQueueQuery(
  params: { friend_id: number; limit: number },
  options?: QueryOptions,
) {
  return useQuery<RecordCareQueueResponse, Error>({
    queryKey: queryKeys.recordCareQueue({ friend_id: params.friend_id, limit: params.limit }),
    queryFn: () => getRecordCareQueue(params),
    enabled: options?.enabled ?? true,
    staleTime: STALE_TIME,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
}

export function useRecordCareProgressQuery(params: { friend_id: number }, options?: QueryOptions) {
  return useQuery<RecordCareProgressResponse, Error>({
    queryKey: queryKeys.recordCareProgress({ friend_id: params.friend_id }),
    queryFn: () => getRecordCareProgress(params),
    enabled: options?.enabled ?? true,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
  });
}

/** The friend's open stack, or null; at most one is open at a time. */
export function useOpenRecordCareStackQuery(params: { friend_id: number }, options?: QueryOptions) {
  return useQuery<RecordCareSession | null, Error>({
    queryKey: queryKeys.recordCareOpenStack({ friend_id: params.friend_id }),
    queryFn: async () =>
      (await listRecordCareStacks({ friend_id: params.friend_id, status: "open", limit: 1 }))
        .items[0] ?? null,
    enabled: options?.enabled ?? true,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
  });
}

/**
 * Pull and discard. The queue leaves out an open stack's copies, so both
 * refresh everything under the record-care root; the open stack is written
 * straight into its cache so the selection doesn't wait for the refetch.
 */
export function useRecordCareStackMutations(friendId: number) {
  const queryClient = useQueryClient();
  const setOpenStack = (stack: RecordCareSession | null) =>
    queryClient.setQueryData(queryKeys.recordCareOpenStack({ friend_id: friendId }), stack);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.recordCareRoot() });

  const pullMutation = useMutation({
    mutationFn: (size?: number) => pullRecordCareStack({ friend_id: friendId, size }),
    onSuccess: async (result) => {
      setOpenStack(result.stack);
      await invalidate();
    },
  });

  const discardMutation = useMutation({
    mutationFn: (stackId: number) => discardRecordCareStack(stackId, friendId),
    onSuccess: async () => {
      setOpenStack(null);
      await invalidate();
    },
  });

  return {
    pullStack: pullMutation.mutateAsync,
    discardStack: discardMutation.mutateAsync,
    pullPending: pullMutation.isPending,
    discardPending: discardMutation.isPending,
  };
}

/**
 * The care log, newest first (#944). `limit` is the length so far: "more" asks
 * for a longer page, and the shorter one stays up while it loads.
 */
export function useRecordCareLogQuery(
  params: { friend_id: number; limit: number },
  options?: QueryOptions,
) {
  return useQuery<RecordCareLogResponse, Error>({
    queryKey: queryKeys.recordCareLog({ friend_id: params.friend_id, limit: params.limit }),
    queryFn: () => listRecordCareLog(params),
    enabled: options?.enabled ?? true,
    staleTime: STALE_TIME,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
}

/**
 * Log care for a stack or a selection, and undo a log. A logged stack is no
 * longer open and an undone one opens again, so each writes the open stack
 * into its cache before refreshing the root: queue, progress, summary and log.
 */
export function useRecordCareSessionMutations(friendId: number) {
  const queryClient = useQueryClient();
  const setOpenStack = (stack: RecordCareSession | null) =>
    queryClient.setQueryData(queryKeys.recordCareOpenStack({ friend_id: friendId }), stack);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.recordCareRoot() });

  const logMutation = useMutation({
    mutationFn: (input: Omit<RecordCareSessionCreate, "friend_id">) =>
      logRecordCareSession({ friend_id: friendId, ...input }),
    onSuccess: async (result) => {
      if (result.session.stack_no !== null) setOpenStack(null);
      await invalidate();
    },
  });

  const voidMutation = useMutation({
    mutationFn: (sessionId: number) => voidRecordCareSession(sessionId, friendId),
    onSuccess: async (result) => {
      if (result.session.status === "open") setOpenStack(result.session);
      await invalidate();
    },
  });

  return {
    logSession: logMutation.mutateAsync,
    voidSession: voidMutation.mutateAsync,
    logPending: logMutation.isPending,
    voidPending: voidMutation.isPending,
  };
}
