// The log care modal's rules and the care log's wording (#944), kept pure so
// they can be tested on their own.
import { recordCareSessionCreateSchema } from "@groovenet/contracts";
import type { CleaningMethod, RecordActionType, SleeveType } from "@/lib/recordCare";
import { RECORD_ACTION_TYPES } from "@/lib/recordCare";
import type {
  RecordCareLogEntry,
  RecordCareSessionCreate,
} from "@/services/internalApi/recordCare";
import { actionLabel } from "@/components/records/recordCareFormat";
import { formatDateTimeLocalInput } from "@/components/spins/spinForm";

const count = (n: number) => n.toLocaleString("en-US");
const records = (n: number) => `${count(n)} ${n === 1 ? "RECORD" : "RECORDS"}`;

export type LogCareFormState = {
  /** Any of the four; one save writes an action per copy per type. */
  types: RecordActionType[];
  /** A `datetime-local` value, in the viewer's time zone. */
  occurredAtInput: string;
  /** Empty when no method was chosen ("Not recorded"); only a cleaning has one. */
  method: CleaningMethod | "";
  /** Only a sleeve change sends one; empty until chosen. */
  sleeveType: SleeveType | "";
  notes: string;
};

export function initialLogCareState(
  defaultSleeve: SleeveType,
  now: Date = new Date(),
): LogCareFormState {
  return {
    types: ["cleaned"],
    occurredAtInput: formatDateTimeLocalInput(now),
    method: "",
    sleeveType: defaultSleeve,
    notes: "",
  };
}

/** Ticks or unticks a type, keeping the API's order. */
export function toggleCareType(
  types: RecordActionType[],
  type: RecordActionType,
): RecordActionType[] {
  const next = types.includes(type) ? types.filter((t) => t !== type) : [...types, type];
  return RECORD_ACTION_TYPES.filter((t) => next.includes(t));
}

export type LogCareField = "care" | "when" | "sleeve";
export type LogCareErrors = Partial<Record<LogCareField, string>>;

/**
 * Why the form cannot be saved, by field; empty when it can. The rules are
 * `refineRecordCareSessionCreate`'s: a type at least, a date, and a sleeve for
 * (and only for) a sleeve change. The method is dropped without a cleaning.
 */
export function logCareFormErrors(state: LogCareFormState): LogCareErrors {
  const errors: LogCareErrors = {};
  if (state.types.length === 0) errors.care = "Choose at least one kind of care.";
  if (!state.occurredAtInput || Number.isNaN(new Date(state.occurredAtInput).getTime())) {
    errors.when = "Choose when it happened.";
  }
  if (state.types.includes("sleeved") && !state.sleeveType) {
    errors.sleeve = "Choose the new sleeve.";
  }
  return errors;
}

/** A pulled stack, or an ad-hoc selection of copies. */
export type LogCareTarget =
  { stack_id: number } | { copies: NonNullable<RecordCareSessionCreate["copies"]> };

/**
 * The POST body, without `friend_id`. Fields the chosen types do not take are
 * left out, as the API rejects them.
 */
export function buildLogCareBody(
  state: LogCareFormState,
  target: LogCareTarget,
): Omit<RecordCareSessionCreate, "friend_id"> {
  const notes = state.notes.trim();
  return {
    ...target,
    action_types: state.types,
    occurred_at: new Date(state.occurredAtInput).toISOString(),
    ...(notes ? { notes } : {}),
    ...(state.types.includes("sleeved") && state.sleeveType
      ? { sleeve_type: state.sleeveType }
      : {}),
    ...(state.types.includes("cleaned") && state.method
      ? { details: { method: state.method } }
      : {}),
  };
}

/** The API's own check of a body; the first problem, or null when it passes. */
export function logCareBodyError(body: Omit<RecordCareSessionCreate, "friend_id">): string | null {
  const parsed = recordCareSessionCreateSchema.safeParse({ friend_id: 0, ...body });
  return parsed.success ? null : parsed.error.issues[0].message;
}

/** "STACK 2 · 10 RECORDS", or "3 RECORDS" for an ad-hoc selection. */
export function logCareTitle(stackNo: number | null, n: number): string {
  return stackNo !== null ? `STACK ${stackNo} · ${records(n)}` : records(n);
}

/** A selection key from `rowKey` as the API's copy ref. */
export function copyRefFromKey(key: string): { copy_id: number } | { release_id: string } {
  return key.startsWith("copy:")
    ? { copy_id: Number(key.slice("copy:".length)) }
    : { release_id: key.slice("release:".length) };
}

/** "CLEANED + SLEEVE CHANGE". */
export function careTypesLabel(types: RecordActionType[]): string {
  return types.map((t) => actionLabel(t).toUpperCase()).join(" + ");
}

/** "STACK 1 · CLEANED + SLEEVE CHANGE · 10 RECORDS"; no stack for an ad-hoc log. */
export function careLogHeadline(
  entry: Pick<RecordCareLogEntry, "stack_no" | "action_types" | "record_count">,
): string {
  const stack = entry.stack_no !== null ? `STACK ${entry.stack_no} · ` : "";
  return `${stack}${careTypesLabel(entry.action_types)} · ${records(entry.record_count)}`;
}

export type SourceBadge = { label: string; borderStyle: "dotted" | "solid" | "dashed" | "double" };

/** VIA WEB / CLI / MCP, told apart by the border as well as the word. */
export function careSourceBadge(source: RecordCareLogEntry["source"]): SourceBadge {
  switch (source) {
    case "cli":
      return { label: "VIA CLI", borderStyle: "solid" };
    case "mcp":
      return { label: "VIA MCP", borderStyle: "dashed" };
    case "api":
      return { label: "VIA API", borderStyle: "double" };
    default:
      return { label: "VIA WEB", borderStyle: "dotted" };
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** "TODAY · 11:09 PM", "YESTERDAY · 9:30 AM", "OCT 17 · 8:00 PM", "DEC 2, 2025 · 8:00 PM". */
export function careLogWhen(occurredAt: string, timeZone: string, now: Date = new Date()): string {
  const at = new Date(occurredAt);
  const dayOf = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone, dateStyle: "short" }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
  let day: string;
  if (dayOf(at) === dayOf(now)) day = "TODAY";
  else if (dayOf(at) === dayOf(new Date(now.getTime() - DAY_MS))) day = "YESTERDAY";
  else {
    const sameYear =
      new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(at) ===
      new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(now);
    day = new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    })
      .format(at)
      .toUpperCase();
  }
  return `${day} · ${time}`;
}

/**
 * The service's `ANOTHER_STACK_OPEN` message (recordCareSessionService.ts),
 * the 409 an undo gets while another stack is open.
 */
export const ANOTHER_STACK_OPEN_MESSAGE = "Another stack is open; log or clear it first";

/** An undo's failure, in words a person can act on. */
export function undoErrorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message === ANOTHER_STACK_OPEN_MESSAGE) {
    return "Another stack is open. Log or clear it, then undo this one.";
  }
  return `Couldn't undo: ${message}`;
}
