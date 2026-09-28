import type { SpinUpdateParams } from "@/services/internalApi/spins";
import type { SpinListItem } from "./spinSummary";

export type SpinSelectionMode = "sides" | "tracks";

export type SpinFormState = {
  selectionMode: SpinSelectionMode;
  sideKeys: string[];
  /** `${track_id}:${friend_id}`, as the album's playable structure keys them. */
  trackKeys: string[];
  /** A `datetime-local` value, in the viewer's time zone. */
  playedAtInput: string;
  note: string;
  contextType: string;
};

export type SpinChanges = Omit<SpinUpdateParams, "friend_id">;

export function formatDateTimeLocalInput(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function trackKey(trackId: string, friendId: number): string {
  return `${trackId}:${friendId}`;
}

export function parseTrackKey(key: string): { track_id: string; friend_id: number } {
  // Track ids can hold a colon; the friend id after the last one cannot.
  const split = key.lastIndexOf(":");
  return { track_id: key.slice(0, split), friend_id: Number(key.slice(split + 1)) };
}

/** A blank form for logging a spin, or one filled from the spin being edited. */
export function initialSpinFormState(spin?: SpinListItem, now: Date = new Date()): SpinFormState {
  if (!spin) {
    return {
      selectionMode: "sides",
      sideKeys: [],
      trackKeys: [],
      playedAtInput: formatDateTimeLocalInput(now),
      note: "",
      contextType: "",
    };
  }

  // A detected spin is one track; edit it as a track selection.
  const selectionMode: SpinSelectionMode =
    spin.session.selection_mode === "sides" ? "sides" : "tracks";
  return {
    selectionMode,
    sideKeys:
      selectionMode === "sides"
        ? spin.selections
            .filter((selection) => selection.selection_type === "side" && selection.side_key)
            .map((selection) => selection.side_key as string)
        : [],
    trackKeys:
      selectionMode === "tracks"
        ? spin.track_events.map((event) => trackKey(event.track_id, event.friend_id))
        : [],
    playedAtInput: formatDateTimeLocalInput(new Date(spin.session.played_at)),
    note: spin.session.note ?? "",
    contextType: spin.session.context_type ?? "",
  };
}

function sameMembers(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

/**
 * What an edit changed, as a PATCH body, or null when nothing did.
 * Only changed fields are sent: an unchanged save must not mark a detected
 * spin as corrected, or rewrite its track events for nothing.
 */
export function buildSpinChanges(
  initial: SpinFormState,
  current: SpinFormState
): SpinChanges | null {
  const changes: SpinChanges = {};

  if (current.playedAtInput !== initial.playedAtInput) {
    changes.played_at = new Date(current.playedAtInput).toISOString();
  }
  if (current.note.trim() !== initial.note.trim()) {
    changes.note = current.note.trim() || null;
  }
  if (current.contextType.trim() !== initial.contextType.trim()) {
    changes.context_type = current.contextType.trim() || null;
  }

  const modeChanged = current.selectionMode !== initial.selectionMode;
  if (current.selectionMode === "sides") {
    if (modeChanged || !sameMembers(current.sideKeys, initial.sideKeys)) {
      changes.side_keys = current.sideKeys;
    }
  } else if (modeChanged || !sameMembers(current.trackKeys, initial.trackKeys)) {
    changes.track_refs = current.trackKeys.map(parseTrackKey);
  }

  return Object.keys(changes).length > 0 ? changes : null;
}
