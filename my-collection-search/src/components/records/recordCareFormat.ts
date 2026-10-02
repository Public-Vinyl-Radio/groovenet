import type {
  CleaningMethod,
  RecordActionType,
  SleeveType,
} from "@/lib/recordCare";
import type { RecordAction, RecordCopyListItem } from "@/services/internalApi/recordCare";

/** In menu order: the sleeve most copies are moving to comes first. */
const SLEEVE_LABELS: Record<SleeveType, string> = {
  "poly-rice-paper-poly": "Poly / rice paper / poly",
  poly: "Poly",
  paper: "Paper",
  original: "Original",
};

const CLEANING_METHOD_LABELS: Record<CleaningMethod, string> = {
  "dry-brush": "Dry brush",
  "wet-manual": "Wet, by hand",
  vacuum: "Vacuum machine",
  ultrasonic: "Ultrasonic",
  other: "Other",
};

const ACTION_LABELS: Record<RecordActionType, string> = {
  cleaned: "Cleaned",
  sleeved: "Sleeve change",
  inspected: "Inspected",
  repaired: "Repaired",
};

const optionsOf = <T extends string>(labels: Record<T, string>) =>
  (Object.entries(labels) as [T, string][]).map(([value, label]) => ({ value, label }));

export const SLEEVE_OPTIONS = optionsOf(SLEEVE_LABELS);
export const CLEANING_METHOD_OPTIONS = optionsOf(CLEANING_METHOD_LABELS);
export const ACTION_OPTIONS = optionsOf(ACTION_LABELS);

export function sleeveLabel(sleeve: SleeveType | null): string {
  return sleeve ? SLEEVE_LABELS[sleeve] : "Unknown sleeve";
}

export function actionLabel(actionType: RecordActionType): string {
  return ACTION_LABELS[actionType];
}

/** "Cleaned · Vacuum machine", "Sleeve change → Poly". */
export function describeAction(action: Pick<RecordAction, "action_type" | "sleeve_type" | "details">) {
  const label = actionLabel(action.action_type);
  if (action.action_type === "sleeved" && action.sleeve_type) {
    return `${label} → ${sleeveLabel(action.sleeve_type)}`;
  }
  if (action.details.method) {
    return `${label} · ${CLEANING_METHOD_LABELS[action.details.method]}`;
  }
  return label;
}

/** A copy's label, else what it is: the default, or its place among the copies. */
export function copyName(copy: Pick<RecordCopyListItem, "label" | "is_default">, index: number) {
  if (copy.label) return copy.label;
  return copy.is_default ? "Default copy" : `Copy ${index + 1}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type CleaningState = "never_cleaned" | "overdue" | "clean";

/** Never cleaned, or last cleaned more than `overdueDays` ago — the API's rule. */
export function cleaningState(
  lastCleanedAt: string | null,
  overdueDays: number | undefined,
  now: Date = new Date()
): CleaningState {
  if (!lastCleanedAt) return "never_cleaned";
  if (overdueDays === undefined) return "clean";
  const age = now.getTime() - new Date(lastCleanedAt).getTime();
  return age > overdueDays * DAY_MS ? "overdue" : "clean";
}

/** "Cleaned today", "Cleaned 3 days ago", "Cleaned 14 months ago". */
export function formatLastCleaned(lastCleanedAt: string | null, now: Date = new Date()): string {
  if (!lastCleanedAt) return "Never cleaned";
  const days = Math.floor((now.getTime() - new Date(lastCleanedAt).getTime()) / DAY_MS);
  if (days < 1) return "Cleaned today";
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (days < 60) return `Cleaned ${plural(days, "day")} ago`;
  if (days < 730) return `Cleaned ${plural(Math.floor(days / 30), "month")} ago`;
  return `Cleaned ${plural(Math.floor(days / 365), "year")} ago`;
}
