// The TUI's status-line rendering of a playback error (#1241): the worker's
// sentence first, so a narrow pane cuts the detail, never the instruction.
import { describePlayerError } from "@groovenet/client";
import type { ServerPlayerErrorState } from "@groovenet/contracts";
import type { Segment } from "../tui/primitives.js";

export function errorSegments(
  error: { code: string; message: string } | null | undefined,
): Segment[] | null {
  const view = describePlayerError(error as ServerPlayerErrorState | null | undefined);
  if (!error || !view) return null;
  const detail: Segment[] = view.detail ? [{ text: ` · ${view.detail}`, role: "muted" }] : [];
  // A speaker that is back is a hint to press play, not a failure.
  if (view.back) return [{ text: view.headline, role: "live" }, ...detail];
  return [{ text: `${error.code}: ${view.headline}`, role: "error" }, ...detail];
}

/** The plain-text detail line under `player status`, or null. */
export function errorDetail(
  error: { code: string; message: string } | null | undefined,
): string | null {
  return describePlayerError(error as ServerPlayerErrorState | null | undefined)?.detail ?? null;
}
