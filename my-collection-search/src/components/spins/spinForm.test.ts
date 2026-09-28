import { describe, expect, it } from "vitest";
import {
  buildSpinChanges,
  formatDateTimeLocalInput,
  initialSpinFormState,
  parseTrackKey,
  trackKey,
} from "./spinForm";
import type { SpinListItem } from "./spinSummary";

const PLAYED_AT = new Date(2026, 8, 20, 21, 30).toISOString();

function spin(overrides: {
  selection_mode: SpinListItem["session"]["selection_mode"];
  side_keys?: string[];
  track_ids?: string[];
  note?: string | null;
  context_type?: string | null;
}): SpinListItem {
  return {
    session: {
      id: 9,
      friend_id: 6,
      release_id: "r1",
      medium: "vinyl",
      selection_mode: overrides.selection_mode,
      played_at: PLAYED_AT,
      note: overrides.note ?? null,
      context_type: overrides.context_type ?? null,
      created_at: PLAYED_AT,
      updated_at: PLAYED_AT,
    },
    selections: (overrides.side_keys ?? []).map((side_key, ordinal) => ({
      ordinal,
      selection_type: "side" as const,
      side_key,
    })),
    track_events: (overrides.track_ids ?? []).map((track_id, ordinal) => ({
      friend_id: 6,
      release_id: "r1",
      track_id,
      played_at: PLAYED_AT,
      ordinal,
    })),
    derived: {
      is_full_album_spin: false,
      selected_side_count: 0,
      album_side_count: 0,
      track_count: 0,
    },
  };
}

describe("track keys", () => {
  it("round-trip, even when the track id holds a colon", () => {
    expect(parseTrackKey(trackKey("33416876-B7", 6))).toEqual({ track_id: "33416876-B7", friend_id: 6 });
    expect(parseTrackKey(trackKey("disc:1:A2", 12))).toEqual({ track_id: "disc:1:A2", friend_id: 12 });
  });
});

describe("initialSpinFormState", () => {
  it("starts a new spin blank, by sides, now", () => {
    const now = new Date(2026, 8, 27, 13, 5);
    expect(initialSpinFormState(undefined, now)).toEqual({
      selectionMode: "sides",
      sideKeys: [],
      trackKeys: [],
      playedAtInput: formatDateTimeLocalInput(now),
      note: "",
      contextType: "",
    });
  });

  it("fills a side spin from its sides", () => {
    const state = initialSpinFormState(
      spin({ selection_mode: "sides", side_keys: ["A", "B"], track_ids: ["t1", "t2"], note: "nice", context_type: "gig" })
    );
    expect(state).toMatchObject({
      selectionMode: "sides",
      sideKeys: ["A", "B"],
      trackKeys: [],
      playedAtInput: "2026-09-20T21:30",
      note: "nice",
      contextType: "gig",
    });
  });

  it("edits a detected spin as a track selection", () => {
    const state = initialSpinFormState(spin({ selection_mode: "automatic", track_ids: ["t1"] }));
    expect(state.selectionMode).toBe("tracks");
    expect(state.trackKeys).toEqual(["t1:6"]);
    expect(state.sideKeys).toEqual([]);
  });
});

describe("buildSpinChanges", () => {
  const initial = initialSpinFormState(
    spin({ selection_mode: "tracks", track_ids: ["t1", "t2"], note: "first" })
  );

  it("is null when nothing changed, so a detected spin is not marked corrected", () => {
    expect(buildSpinChanges(initial, { ...initial })).toBeNull();
  });

  it("ignores reordering and surrounding whitespace", () => {
    expect(
      buildSpinChanges(initial, { ...initial, trackKeys: ["t2:6", "t1:6"], note: "  first " })
    ).toBeNull();
  });

  it("sends only what changed", () => {
    expect(buildSpinChanges(initial, { ...initial, note: "", contextType: " home " })).toEqual({
      note: null,
      context_type: "home",
    });
  });

  it("sends a rewritten note, and a cleared context as null", () => {
    const withContext = { ...initial, contextType: "gig" };
    expect(buildSpinChanges(withContext, { ...withContext, note: "second", contextType: "" })).toEqual({
      note: "second",
      context_type: null,
    });
  });

  it("sends a new time as an ISO instant", () => {
    const changes = buildSpinChanges(initial, { ...initial, playedAtInput: "2026-09-20T20:00" });
    expect(changes).toEqual({ played_at: new Date(2026, 8, 20, 20, 0).toISOString() });
  });

  it("sends a changed track selection as track refs", () => {
    expect(buildSpinChanges(initial, { ...initial, trackKeys: ["t3:6"] })).toEqual({
      track_refs: [{ track_id: "t3", friend_id: 6 }],
    });
  });

  it("sends sides when switching from tracks, even to the same keys", () => {
    const sides = initialSpinFormState(spin({ selection_mode: "sides", side_keys: ["A"] }));
    expect(buildSpinChanges(sides, { ...sides })).toBeNull();
    expect(buildSpinChanges(sides, { ...sides, sideKeys: ["A", "B"] })).toEqual({ side_keys: ["A", "B"] });
    expect(buildSpinChanges(initial, { ...initial, selectionMode: "sides", sideKeys: ["A"] })).toEqual({
      side_keys: ["A"],
    });
  });
});
