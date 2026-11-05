// Wording and arithmetic for the Chores page (#943), kept pure so it can be
// tested on its own.
import type { SleeveType } from "@/lib/recordCare";
import type {
  RecordCareProgressResponse,
  RecordCareQueueItem,
  RecordCareStackItem,
} from "@/services/internalApi/recordCare";
import { DIGITAL_HATCH, inkTint } from "@/components/spins/recapParts";

/**
 * The terminal command that logs a pulled stack. #946 ships it; change it
 * here if the final name differs.
 */
export const CHORES_CLI_STACK_COMMAND = "groovenet records clean --stack";

export function choresCliHint(stackNo: number): string {
  return `${CHORES_CLI_STACK_COMMAND} ${stackNo}`;
}

export const STACK_SIZE = 10;

const count = (n: number) => n.toLocaleString("en-US");

/** A row's selection key: the copy, or a release's implicit default copy. */
export function rowKey(item: Pick<RecordCareQueueItem, "copy_id" | "release_id">): string {
  return item.copy_id !== null ? `copy:${item.copy_id}` : `release:${item.release_id}`;
}

/** Copies still to clean for the first time. */
export function todoCount(progress: Pick<RecordCareProgressResponse, "cleaned" | "total">) {
  return Math.max(0, progress.total - progress.cleaned);
}

/** The header meta: "412 copies · 402 to do". */
export function choresMeta(progress: Pick<RecordCareProgressResponse, "cleaned" | "total">) {
  const copies = `${count(progress.total)} ${progress.total === 1 ? "copy" : "copies"}`;
  return `${copies} · ${count(todoCount(progress))} to do`;
}

/** "STACK 2 OF 42 UP NEXT" (desktop), "STACK 2 OF 42 NEXT" (phone). */
export function stackUpNextLabel(
  progress: Pick<RecordCareProgressResponse, "next_stack_no" | "stacks_total" | "total">,
  variant: "desktop" | "phone",
): string {
  if (progress.total === 0) return "NO RECORDS YET";
  if (progress.next_stack_no === null) return "ALL CLEANED";
  const next = variant === "phone" ? "NEXT" : "UP NEXT";
  return `STACK ${count(progress.next_stack_no)} OF ${count(progress.stacks_total)} ${next}`;
}

/** The block grid's text label. */
export function progressAriaLabel(
  progress: Pick<RecordCareProgressResponse, "cleaned" | "total" | "stack_size">,
): string {
  return `${count(progress.cleaned)} of ${count(progress.total)} copies cleaned, in stacks of ${progress.stack_size}`;
}

export type StackBlock = "done" | "next" | "todo";

/** One block per stack: done, the next one, the rest. */
export function stackBlocks(
  progress: Pick<RecordCareProgressResponse, "stacks_total" | "stacks_done" | "next_stack_no">,
): StackBlock[] {
  return Array.from({ length: progress.stacks_total }, (_, i) =>
    i < progress.stacks_done ? "done" : progress.next_stack_no === i + 1 ? "next" : "todo",
  );
}

const perWeek = (n: number) => {
  const rounded = Math.round(n * 10) / 10;
  return `${rounded} ${rounded === 1 ? "STACK" : "STACKS"}/WEEK`;
};

/** "ONE BLOCK = ONE STACK OF 10 · 1.5 STACKS/WEEK FINISHES BY MAR 14, 2027"; no pace, no clause. */
export function paceLine(
  progress: Pick<RecordCareProgressResponse, "stack_size" | "pace">,
  timeZone: string,
): string {
  const legend = `ONE BLOCK = ONE STACK OF ${progress.stack_size}`;
  if (!progress.pace) return legend;
  const by = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(progress.pace.projected_finish_date));
  return `${legend} · ${perWeek(progress.pace.stacks_per_week)} FINISHES BY ${by.toUpperCase()}`;
}

export type SleeveKey = SleeveType | "unknown";

type SleeveStyle = { key: SleeveKey; label: string; short: string; fill: string };

/** In bar order; each fill follows the palette, and unknown is hatched. */
export const SLEEVE_STYLES: SleeveStyle[] = [
  {
    key: "poly-rice-paper-poly",
    label: "Poly / rice paper / poly",
    short: "POLY/RICE/POLY",
    fill: "var(--gn-ink)",
  },
  { key: "poly", label: "Poly", short: "POLY", fill: inkTint(60) },
  { key: "paper", label: "Paper", short: "PAPER", fill: inkTint(32) },
  { key: "original", label: "Original", short: "ORIGINAL", fill: inkTint(12) },
  { key: "unknown", label: "Unknown", short: "UNKNOWN", fill: DIGITAL_HATCH },
];

export type SleeveCounts = RecordCareProgressResponse["by_sleeve_type"];

export function sleeveTotal(bySleeve: SleeveCounts): number {
  return SLEEVE_STYLES.reduce((sum, s) => sum + bySleeve[s.key], 0);
}

/** "Copies by sleeve: 10 poly / rice paper / poly; 402 unknown". */
export function sleeveAriaLabel(bySleeve: SleeveCounts): string {
  const parts = SLEEVE_STYLES.filter((s) => bySleeve[s.key] > 0).map(
    (s) => `${count(bySleeve[s.key])} ${s.label.toLowerCase()}`,
  );
  return parts.length ? `Copies by sleeve: ${parts.join("; ")}` : "No copies yet";
}

/** "POLY 0 · PAPER 0": the sleeves no copy has, or the phone's one-line legend. */
export function sleeveLine(bySleeve: SleeveCounts, which: "used" | "unused"): string {
  return SLEEVE_STYLES.filter((s) => (which === "used") === bySleeve[s.key] > 0)
    .map((s) => `${s.short} ${count(bySleeve[s.key])}`)
    .join(" · ");
}

/** "SPUN 3× IN OCT". */
export function spunMeta(spinCount: number, windowLabel: string): string {
  return `SPUN ${count(spinCount)}× IN ${windowLabel}`;
}

/** "ADDED OCT 17". */
export function addedMeta(addedAt: string, timeZone: string): string {
  const day = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" });
  return `ADDED ${day.format(new Date(addedAt)).toUpperCase()}`;
}

export function moreInBacklog(remaining: number): string {
  return `${count(remaining)} MORE IN THE BACKLOG`;
}

/**
 * The selection bar's label. Desktop: "STACK 2 · 10 SELECTED", "3 SELECTED";
 * phone drops the word: "STACK 2 · 10".
 */
export function selectionLabel(
  selected: number,
  stackNo: number | null,
  variant: "desktop" | "phone",
): string {
  if (selected === 0) return "Select records, or pull the next stack.";
  const n = count(selected);
  if (stackNo === null) return `${n} SELECTED`;
  return variant === "phone" ? `STACK ${stackNo} · ${n}` : `STACK ${stackNo} · ${n} SELECTED`;
}

/** A pulled stack's copy as a queue row; an album that has left keeps a name. */
export function stackItemRow(item: RecordCareStackItem): RecordCareQueueItem {
  return {
    copy_id: item.copy_id,
    release_id: item.release_id,
    title: item.album_title ?? "Unknown album",
    artist: item.album_artist ?? "",
    thumbnail: item.album_thumbnail,
    inner_sleeve_type: item.inner_sleeve_type,
    added_at: null,
  };
}
