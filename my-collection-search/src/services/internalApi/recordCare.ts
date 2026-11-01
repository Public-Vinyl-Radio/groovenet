import { z } from "zod";
import type {
  RecordCareProgressQuery,
  RecordCareProgressResponse,
  RecordCareQueueQuery,
  RecordCareQueueResponse,
  RecordCareSession,
  RecordCareStackDiscardResponse,
  RecordCareStackListQuery,
  RecordCareStackListResponse,
  RecordCareStackPull,
  RecordCareStackPullResponse,
} from "@groovenet/contracts";
import {
  recordActionCreateBodySchema,
  recordActionListQuerySchema,
  recordActionListResponseSchema,
  recordActionMutationResponseSchema,
  recordActionSchema,
  recordActionVoidResponseSchema,
  recordCareItemSchema,
  recordCareQuerySchema,
  recordCareResponseSchema,
  recordCareSummaryQuerySchema,
  recordCareSummaryResponseSchema,
  recordCopyCreateBodySchema,
  recordCopyDefaultUpdateBodySchema,
  recordCopyDeleteResponseSchema,
  recordCopyListItemSchema,
  recordCopyListQuerySchema,
  recordCopyListResponseSchema,
  recordCopyResponseSchema,
  recordCopyUpdateBodySchema,
} from "@/api-contract/schemas";
import { http } from "@/services/http";

export type RecordCopyListItem = z.infer<typeof recordCopyListItemSchema>;
export type RecordCopyListParams = z.infer<typeof recordCopyListQuerySchema>;
export type RecordCopyListResponse = z.infer<typeof recordCopyListResponseSchema>;
export type RecordCopyCreateParams = z.infer<typeof recordCopyCreateBodySchema>;
export type RecordCopyUpdateParams = z.infer<typeof recordCopyUpdateBodySchema>;
export type RecordCopyDefaultUpdateParams = z.infer<typeof recordCopyDefaultUpdateBodySchema>;
export type RecordCopyResponse = z.infer<typeof recordCopyResponseSchema>;
export type RecordCopyDeleteResponse = z.infer<typeof recordCopyDeleteResponseSchema>;

export type RecordAction = z.infer<typeof recordActionSchema>;
/** The query, with the defaulted fields left optional. */
type Paged<T> = Omit<T, "limit" | "offset" | "include_voided"> & {
  limit?: number;
  offset?: number;
};

export type RecordActionListParams = Paged<z.infer<typeof recordActionListQuerySchema>> & {
  include_voided?: boolean;
};
export type RecordActionListResponse = z.infer<typeof recordActionListResponseSchema>;
export type RecordActionCreateParams = z.infer<typeof recordActionCreateBodySchema>;
export type RecordActionMutationResponse = z.infer<typeof recordActionMutationResponseSchema>;
export type RecordActionVoidResponse = z.infer<typeof recordActionVoidResponseSchema>;

export type RecordCareItem = z.infer<typeof recordCareItemSchema>;
export type RecordCareParams = Paged<z.infer<typeof recordCareQuerySchema>>;
export type RecordCareResponse = z.infer<typeof recordCareResponseSchema>;
export type RecordCareSummaryParams = z.infer<typeof recordCareSummaryQuerySchema>;
export type RecordCareSummaryResponse = z.infer<typeof recordCareSummaryResponseSchema>;

export type {
  RecordCareProgressResponse,
  RecordCareQueueResponse,
  RecordCareSession,
  RecordCareStackListResponse,
  RecordCareStackPullResponse,
};
export type RecordCareQueueItem = RecordCareQueueResponse["backlog"]["items"][number];
export type RecordCareSpunItem = RecordCareQueueResponse["spun_recently"]["items"][number];
export type RecordCareStackItem = RecordCareSession["items"][number];

const GET_NO_STORE: RequestInit = { method: "GET", cache: "no-store" };

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

/** A query string of the params that are set. */
function query(params: Record<string, string | number | boolean | undefined>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) searchParams.append(key, String(value));
  }
  return searchParams.toString();
}

const copyPath = (id: number) => `/api/record-copies/${encodeURIComponent(String(id))}`;

/** A release's copies; one untouched has its implicit default, with `id: null`. */
export async function listRecordCopies(
  params: RecordCopyListParams,
): Promise<RecordCopyListResponse> {
  return await http<RecordCopyListResponse>(
    `/api/record-copies?${query({ friend_id: params.friend_id, release_id: params.release_id })}`,
    GET_NO_STORE,
  );
}

/** Adds one more physical copy; an untouched release's default is made real first. */
export async function createRecordCopy(
  params: RecordCopyCreateParams,
): Promise<RecordCopyResponse> {
  return await http<RecordCopyResponse>("/api/record-copies", jsonInit("POST", params));
}

export async function updateRecordCopy(
  id: number,
  params: RecordCopyUpdateParams,
): Promise<RecordCopyResponse> {
  return await http<RecordCopyResponse>(copyPath(id), jsonInit("PATCH", params));
}

/** Labels or annotates a release's default copy, which may have no id yet. */
export async function updateDefaultRecordCopy(
  params: RecordCopyDefaultUpdateParams,
): Promise<RecordCopyResponse> {
  return await http<RecordCopyResponse>("/api/record-copies/default", jsonInit("PATCH", params));
}

export async function deleteRecordCopy(
  id: number,
  friendId: number,
): Promise<RecordCopyDeleteResponse> {
  return await http<RecordCopyDeleteResponse>(`${copyPath(id)}?${query({ friend_id: friendId })}`, {
    method: "DELETE",
  });
}

/** A copy's history, newest first. */
export async function listRecordActions(
  copyId: number,
  params: RecordActionListParams,
): Promise<RecordActionListResponse> {
  return await http<RecordActionListResponse>(
    `${copyPath(copyId)}/actions?${query({
      friend_id: params.friend_id,
      action_type: params.action_type,
      include_voided: params.include_voided,
      limit: params.limit,
      offset: params.offset,
    })}`,
    GET_NO_STORE,
  );
}

/**
 * Logs against a copy (`copy_id`) or a release's default copy (`release_id`),
 * credited to the web app unless the caller says otherwise.
 */
export async function createRecordAction(
  params: RecordActionCreateParams,
): Promise<RecordActionMutationResponse> {
  return await http<RecordActionMutationResponse>(
    "/api/record-actions",
    jsonInit("POST", { source: "web", ...params }),
  );
}

/** Voids a mistaken action; it stays in the history but stops counting. */
export async function voidRecordAction(
  id: number,
  friendId: number,
): Promise<RecordActionVoidResponse> {
  return await http<RecordActionVoidResponse>(
    `/api/record-actions/${encodeURIComponent(String(id))}?${query({ friend_id: friendId })}`,
    { method: "DELETE" },
  );
}

export async function listRecordCare(params: RecordCareParams): Promise<RecordCareResponse> {
  return await http<RecordCareResponse>(
    `/api/record-copies/care?${query({
      friend_id: params.friend_id,
      status: params.status,
      overdue_days: params.overdue_days,
      needs_sleeve: params.needs_sleeve,
      sleeve_type: params.sleeve_type,
      limit: params.limit,
      offset: params.offset,
    })}`,
    GET_NO_STORE,
  );
}

export async function getRecordCareSummary(
  params: RecordCareSummaryParams,
): Promise<RecordCareSummaryResponse> {
  return await http<RecordCareSummaryResponse>(
    `/api/record-copies/care/summary?${query({
      friend_id: params.friend_id,
      overdue_days: params.overdue_days,
      needs_sleeve: params.needs_sleeve,
    })}`,
    GET_NO_STORE,
  );
}

/** The chores queue (#942): spun recently, new arrivals, then one page of the backlog. */
export async function getRecordCareQueue(
  params: RecordCareQueueQuery,
): Promise<RecordCareQueueResponse> {
  return await http<RecordCareQueueResponse>(
    `/api/record-care/queue?${query({
      friend_id: params.friend_id,
      month: params.month,
      limit: params.limit,
      offset: params.offset,
    })}`,
    GET_NO_STORE,
  );
}

/** Library cleaning progress: cleaned / total, stacks, pace and sleeves. */
export async function getRecordCareProgress(
  params: RecordCareProgressQuery,
): Promise<RecordCareProgressResponse> {
  return await http<RecordCareProgressResponse>(
    `/api/record-care/progress?${query({
      friend_id: params.friend_id,
      stack_size: params.stack_size,
    })}`,
    GET_NO_STORE,
  );
}

/**
 * Pulls the next stack from the queue, credited to the web app unless the
 * caller says otherwise. An open stack is returned instead of a second one.
 */
export async function pullRecordCareStack(
  params: RecordCareStackPull,
): Promise<RecordCareStackPullResponse> {
  return await http<RecordCareStackPullResponse>(
    "/api/record-care/stacks",
    jsonInit("POST", { source: "web", ...params }),
  );
}

/** The friend's stacks, newest first; `status: "open"` for the one in progress. */
export async function listRecordCareStacks(
  params: RecordCareStackListQuery,
): Promise<RecordCareStackListResponse> {
  return await http<RecordCareStackListResponse>(
    `/api/record-care/stacks?${query({
      friend_id: params.friend_id,
      status: params.status,
      limit: params.limit,
      offset: params.offset,
    })}`,
    GET_NO_STORE,
  );
}

/** Discards an open stack; its copies go back to the queue. */
export async function discardRecordCareStack(
  id: number,
  friendId: number,
): Promise<RecordCareStackDiscardResponse> {
  return await http<RecordCareStackDiscardResponse>(
    `/api/record-care/stacks/${encodeURIComponent(String(id))}?${query({ friend_id: friendId })}`,
    { method: "DELETE" },
  );
}
