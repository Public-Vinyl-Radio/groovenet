import type { CleaningMethod, RecordActionType, SleeveType } from "@/lib/recordCare";
import { DEFAULT_TARGET_SLEEVE } from "@/lib/recordCare";
import type {
  RecordActionCreateParams,
  RecordCopyListItem,
} from "@/services/internalApi/recordCare";
import { formatDateTimeLocalInput } from "@/components/spins/spinForm";

/**
 * Which copy an action is for. The default copy — implicit or real — is logged
 * by release, which lands on it either way and makes an implicit one real, so
 * it needs no id and is valid before the copies have loaded.
 */
export const DEFAULT_COPY_KEY = "default";

type CopyRef = Pick<RecordCopyListItem, "id" | "is_default">;

export function copyKey(copy: CopyRef): string {
  return copy.is_default || copy.id === null ? DEFAULT_COPY_KEY : String(copy.id);
}

export type RecordActionFormState = {
  actionType: RecordActionType;
  /** A `datetime-local` value, in the viewer's time zone. */
  occurredAtInput: string;
  notes: string;
  /** Empty when no method was chosen; only a cleaning has one. */
  method: CleaningMethod | "";
  /** Only a sleeve change sends one. */
  sleeveType: SleeveType;
  copyKey: string;
};

export function initialRecordActionState(
  options: { actionType?: RecordActionType; copy?: CopyRef } = {},
  now: Date = new Date()
): RecordActionFormState {
  return {
    actionType: options.actionType ?? "cleaned",
    occurredAtInput: formatDateTimeLocalInput(now),
    notes: "",
    method: "",
    sleeveType: DEFAULT_TARGET_SLEEVE,
    copyKey: options.copy ? copyKey(options.copy) : DEFAULT_COPY_KEY,
  };
}

/** Why the form cannot be saved, or null when it can. */
export function recordActionFormError(state: RecordActionFormState): string | null {
  if (!state.occurredAtInput || Number.isNaN(new Date(state.occurredAtInput).getTime())) {
    return "Choose when it happened.";
  }
  return null;
}

/**
 * The POST body, without `friend_id`. The default copy is named by release,
 * any other by id. Fields the action type does not take are left out, as the
 * API rejects them.
 */
export function buildRecordActionBody(
  state: RecordActionFormState,
  releaseId: string
): Omit<RecordActionCreateParams, "friend_id"> {
  const target =
    state.copyKey === DEFAULT_COPY_KEY
      ? { release_id: releaseId }
      : { copy_id: Number(state.copyKey) };
  const notes = state.notes.trim();
  return {
    ...target,
    action_type: state.actionType,
    occurred_at: new Date(state.occurredAtInput).toISOString(),
    ...(notes ? { notes } : {}),
    ...(state.actionType === "sleeved" ? { sleeve_type: state.sleeveType } : {}),
    ...(state.actionType === "cleaned" && state.method ? { details: { method: state.method } } : {}),
  };
}
