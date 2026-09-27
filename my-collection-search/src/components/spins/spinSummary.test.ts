import { describe, expect, it } from "vitest";
import {
  describeProvenance,
  describeSpinAlbum,
  groupSpinsByDay,
  summarizeSpin,
  type SpinListItem,
} from "./spinSummary";

type Event = SpinListItem["track_events"][number];

function event(ordinal: number, position: string | null, title: string, side_key?: string): Event {
  return {
    friend_id: 1,
    release_id: "r1",
    track_id: `t${ordinal}`,
    played_at: "2026-09-20T21:30:00.000Z",
    ordinal,
    side_key: side_key ?? position?.[0] ?? null,
    position_snapshot: position,
    title_snapshot: title,
  };
}

function spin(overrides: {
  selection_mode?: SpinListItem["session"]["selection_mode"];
  provenance?: "manual" | "automatic";
  confidence?: number | null;
  side_keys?: string[];
  events?: Event[];
  full_album?: boolean;
}): SpinListItem {
  const events = overrides.events ?? [];
  return {
    session: {
      id: 1,
      friend_id: 1,
      release_id: "r1",
      medium: "vinyl",
      selection_mode: overrides.selection_mode ?? "tracks",
      played_at: "2026-09-20T21:30:00.000Z",
      provenance: overrides.provenance ?? "manual",
      confidence: overrides.confidence ?? null,
      created_at: "2026-09-20T21:30:00.000Z",
      updated_at: "2026-09-20T21:30:00.000Z",
    },
    selections: (overrides.side_keys ?? []).map((side_key, ordinal) => ({
      ordinal,
      selection_type: "side" as const,
      side_key,
    })),
    track_events: events,
    derived: {
      is_full_album_spin: overrides.full_album ?? false,
      selected_side_count: overrides.side_keys?.length ?? 0,
      album_side_count: 0,
      track_count: events.length,
    },
  };
}

describe("summarizeSpin", () => {
  it("names a single track with its position", () => {
    const summary = summarizeSpin(
      spin({ selection_mode: "automatic", events: [event(0, "D2", "Tipo Raro")] })
    );
    expect(summary.headline).toBe("D2 · Tipo Raro");
    expect(summary.hasMoreTracks).toBe(false);
  });

  it("names two tracks in play order", () => {
    const summary = summarizeSpin(
      spin({ events: [event(1, "D1", "Bolero"), event(0, "D2", "Tipo Raro")] })
    );
    expect(summary.headline).toBe("D2 · Tipo Raro, D1 · Bolero");
  });

  it("collapses three or more tracks to the first plus a count", () => {
    const summary = summarizeSpin(
      spin({
        events: [event(0, "A1", "One"), event(1, "A2", "Two"), event(2, "A3", "Three")],
      })
    );
    expect(summary.headline).toBe("A1 · One +2 more");
    expect(summary.hasMoreTracks).toBe(true);
    expect(summary.tracks.map((t) => t.title)).toEqual(["One", "Two", "Three"]);
  });

  it("omits the position when there isn't one", () => {
    expect(summarizeSpin(spin({ events: [event(0, null, "Untitled")] })).headline).toBe(
      "Untitled"
    );
  });

  it("labels a side spin by its sides", () => {
    const summary = summarizeSpin(
      spin({
        selection_mode: "sides",
        side_keys: ["A", "B"],
        events: [event(0, "A1", "One"), event(1, "B1", "Two")],
      })
    );
    expect(summary.headline).toBe("Side A, Side B");
    expect(summary.hasMoreTracks).toBe(true);
  });

  it("labels a sideless tracklist and a side with no recorded track", () => {
    const summary = summarizeSpin(
      spin({
        selection_mode: "sides",
        side_keys: ["TRACKLIST", "C"],
        events: [event(0, "1", "Numbered", "TRACKLIST")],
      })
    );
    expect(summary.headline).toBe("Tracklist, Side C");
  });

  it("falls back to the key when a side's position has no label", () => {
    const summary = summarizeSpin(
      spin({ selection_mode: "sides", side_keys: ["X"], events: [event(0, null, "Loose", "X")] })
    );
    expect(summary.headline).toBe("Side X");
  });

  it("names the tracks when a side spin has no side selections", () => {
    const summary = summarizeSpin(
      spin({ selection_mode: "sides", events: [event(0, "A1", "One")] })
    );
    expect(summary.headline).toBe("A1 · One");
  });

  it("fills in a missing title and position", () => {
    const bare = { ...event(0, null, ""), position_snapshot: undefined, title_snapshot: undefined };
    expect(summarizeSpin(spin({ events: [bare] })).headline).toBe("Unknown track");
  });

  it("calls a full-album spin a full album", () => {
    const summary = summarizeSpin(
      spin({ selection_mode: "sides", side_keys: ["A"], full_album: true, events: [event(0, "A1", "One")] })
    );
    expect(summary.headline).toBe("Full album");
  });

  it("says so when no tracks were recorded", () => {
    expect(summarizeSpin(spin({})).headline).toBe("No tracks recorded");
  });
});

describe("describeProvenance", () => {
  it("marks listener spins as automatic, with confidence", () => {
    expect(describeProvenance(spin({ provenance: "automatic", confidence: 0.917 }))).toEqual({
      label: "Auto",
      description: "Detected by the listener · 92% confidence",
    });
  });

  it("omits confidence when the listener didn't report one", () => {
    expect(describeProvenance(spin({ provenance: "automatic" })).description).toBe(
      "Detected by the listener"
    );
  });

  it("marks hand-logged spins as manual", () => {
    expect(describeProvenance(spin({})).label).toBe("Manual");
  });
});

describe("describeSpinAlbum", () => {
  it("prefers the album row", () => {
    const item = {
      ...spin({ events: [{ ...event(0, "D2", "Tipo Raro"), album_snapshot: "Old name" }] }),
      album: { title: "Algo-Ritmo", artist: "MIS", thumbnail: "https://img.example/a.jpg" },
    };
    expect(describeSpinAlbum(item)).toEqual({
      title: "Algo-Ritmo",
      artist: "MIS",
      thumbnail: "https://img.example/a.jpg",
    });
  });

  it("falls back to the event snapshots when the album row is gone", () => {
    const item = {
      ...spin({
        events: [
          { ...event(0, "A6", "Hermanos"), album_snapshot: "BACH", artist_snapshot: "Bandalos Chinos" },
        ],
      }),
      album: null,
    };
    expect(describeSpinAlbum(item)).toEqual({
      title: "BACH",
      artist: "Bandalos Chinos",
      thumbnail: null,
    });
  });

  it("returns nulls when there is nothing to go on", () => {
    expect(describeSpinAlbum(spin({}))).toEqual({ title: null, artist: null, thumbnail: null });
  });
});

describe("groupSpinsByDay", () => {
  // Local times, so the day boundaries hold in any timezone.
  const at = (month: number, day: number, hour: number) =>
    new Date(2026, month - 1, day, hour).toISOString();
  const playedAt = (iso: string) => {
    const item = spin({});
    return { ...item, session: { ...item.session, played_at: iso } };
  };
  const now = new Date(2026, 8, 27, 13);

  it("groups consecutive spins by local day, labelling today and yesterday", () => {
    const groups = groupSpinsByDay(
      [
        playedAt(at(9, 27, 11)),
        playedAt(at(9, 27, 9)),
        playedAt(at(9, 26, 22)),
        playedAt(at(9, 21, 20)),
      ],
      now
    );
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ["Today", 2],
      ["Yesterday", 1],
      [new Date(2026, 8, 21).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }), 1],
    ]);
  });

  it("adds the year for spins from another year", () => {
    const [group] = groupSpinsByDay([playedAt(new Date(2025, 11, 31, 22).toISOString())], now);
    expect(group.label).toContain("2025");
  });

  it("returns no groups for no spins", () => {
    expect(groupSpinsByDay([], now)).toEqual([]);
  });
});
