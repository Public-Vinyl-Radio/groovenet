/**
 * The vocabulary of physical-copy care (#262), shared by the API contract, the
 * repositories and the service. The sleeve and action lists mirror the CHECK
 * constraints in `migrations/1790726400000_add-record-copies-and-actions.js`;
 * widening one means a migration too.
 */

export const SLEEVE_TYPES = ["original", "paper", "poly-rice-paper-poly", "poly"] as const;
export type SleeveType = (typeof SLEEVE_TYPES)[number];

export const RECORD_ACTION_TYPES = ["cleaned", "sleeved", "inspected", "repaired"] as const;
export type RecordActionType = (typeof RECORD_ACTION_TYPES)[number];

export const CLEANING_METHODS = [
  "dry-brush",
  "wet-manual",
  "vacuum",
  "ultrasonic",
  "other",
] as const;
export type CleaningMethod = (typeof CLEANING_METHODS)[number];

export const RECORD_CARE_STATUSES = ["never_cleaned", "overdue", "needs_sleeve"] as const;
export type RecordCareStatus = (typeof RECORD_CARE_STATUSES)[number];

/** The sleeve a copy is assumed to want when a care query names none. */
export const DEFAULT_TARGET_SLEEVE: SleeveType = "poly-rice-paper-poly";

const DEFAULT_OVERDUE_DAYS = 365;

/**
 * Days since its last cleaning before a copy counts as overdue, when a request
 * does not say. `RECORD_CLEANING_OVERDUE_DAYS`, read on every call so a change
 * needs no rebuild.
 */
export function defaultOverdueDays(): number {
  const days = Number(process.env.RECORD_CLEANING_OVERDUE_DAYS);
  return Number.isInteger(days) && days > 0 ? days : DEFAULT_OVERDUE_DAYS;
}
