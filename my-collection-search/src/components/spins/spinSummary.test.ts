import { describe, expect, it } from "vitest";
import {
  describeProvenance,
  describeSpinAlbum,
  formatPlayedAt,
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
      spin({ selection_mode: "automatic", events: [event(0, "D2", "Tipo Raro")] }),
    );
    expect(summary.headline).toBe("D2 · Tipo Raro");
    expect(summary.hasMoreTracks).toBe(false);
  });

  it("names two tracks in play order", () => {
    const summary = summarizeSpin(
      spin({ events: [event(1, "D1", "Bolero"), event(0, "D2", "Tipo Raro")] }),
    );
    expect(summary.headline).toBe("D2 · Tipo Raro, D1 · Bolero");
  });

  it("collapses three or more tracks to the first plus a count", () => {
    const summary = summarizeSpin(
      spin({
        events: [event(0, "A1", "One"), event(1, "A2", "Two"), event(2, "A3", "Three")],
      }),
    );
    expect(summary.headline).toBe("A1 · One +2 more");
    expect(summary.hasMoreTracks).toBe(true);
    expect(summary.tracks.map((t) => t.title)).toEqual(["One", "Two", "Three"]);
  });

  it("omits the position when there isn't one", () => {
    expect(summarizeSpin(spin({ events: [event(0, null, "Untitled")] })).headline).toBe("Untitled");
  });

  it("labels a side spin by its sides", () => {
    const summary = summarizeSpin(
      spin({
        selection_mode: "sides",
        side_keys: ["A", "B"],
        events: [event(0, "A1", "One"), event(1, "B1", "Two")],
      }),
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
      }),
    );
    expect(summary.headline).toBe("Tracklist, Side C");
  });

  it("falls back to the key when a side's position has no label", () => {
    const summary = summarizeSpin(
      spin({ selection_mode: "sides", side_keys: ["X"], events: [event(0, null, "Loose", "X")] }),
    );
    expect(summary.headline).toBe("Side X");
  });

  it("names the tracks when a side spin has no side selections", () => {
    const summary = summarizeSpin(
      spin({ selection_mode: "sides", events: [event(0, "A1", "One")] }),
    );
    expect(summary.headline).toBe("A1 · One");
  });

  it("fills in a missing title and position", () => {
    const bare = { ...event(0, null, ""), position_snapshot: undefined, title_snapshot: undefined };
    expect(summarizeSpin(spin({ events: [bare] })).headline).toBe("Unknown track");
  });

  it("calls a full-album spin a full album", () => {
    const summary = summarizeSpin(
      spin({
        selection_mode: "sides",
        side_keys: ["A"],
        full_album: true,
        events: [event(0, "A1", "One")],
      }),
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
      automatic: true,
    });
  });

  it("omits confidence when the listener didn't report one", () => {
    expect(describeProvenance(spin({ provenance: "automatic" })).description).toBe(
      "Detected by the listener",
    );
  });

  it("says when a detected spin was corrected by hand", () => {
    const item = spin({ provenance: "automatic", confidence: 0.8 });
    item.session.corrected_at = "2026-09-27T12:00:00.000Z";
    expect(describeProvenance(item)).toEqual({
      label: "Auto · corrected",
      description: "Detected by the listener · 80% confidence · corrected by hand",
      automatic: true,
    });
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
          {
            ...event(0, "A6", "Hermanos"),
            album_snapshot: "BACH",
            artist_snapshot: "Bandalos Chinos",
          },
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
  const LA = "America/Los_Angeles";
  const playedAt = (iso: string) => {
    const item = spin({});
    return { ...item, session: { ...item.session, played_at: iso } };
  };
  // 2026-09-27 13:00 PDT (UTC-7)
  const now = new Date("2026-09-27T20:00:00Z");

  it("groups consecutive spins by day, labelling today and yesterday", () => {
    const groups = groupSpinsByDay(
      [
        playedAt("2026-09-27T18:00:00Z"),
        playedAt("2026-09-27T16:00:00Z"),
        playedAt("2026-09-27T05:00:00Z"),
        playedAt("2026-09-22T03:00:00Z"),
      ],
      LA,
      now,
    );
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ["Today", 2],
      ["Yesterday", 1],
      ["Monday, Sep 21", 1],
    ]);
  });

  it("puts a 06:30 UTC spin on the previous day in Los Angeles", () => {
    const [group] = groupSpinsByDay([playedAt("2026-09-27T06:30:00Z")], LA, now);
    expect(group.key).toBe("2026-9-26");
    expect(group.label).toBe("Yesterday");
    const [utc] = groupSpinsByDay([playedAt("2026-09-27T06:30:00Z")], "UTC", now);
    expect(utc.label).toBe("Today");
  });

  it("flips Today/Yesterday at local midnight, not UTC midnight", () => {
    const justAfter = new Date("2026-09-27T07:00:01Z"); // 00:00:01 PDT on the 27th
    const justBefore = new Date("2026-09-27T06:59:59Z"); // 23:59:59 PDT on the 26th
    const spins = [playedAt("2026-09-27T07:00:00Z"), playedAt("2026-09-27T06:59:59Z")];
    expect(groupSpinsByDay(spins, LA, justAfter).map((g) => g.label)).toEqual([
      "Today",
      "Yesterday",
    ]);
    // One second earlier it is still the 26th, so the 06:59:59Z spin is "Today".
    expect(groupSpinsByDay(spins.slice(1), LA, justBefore).map((g) => g.label)).toEqual(["Today"]);
  });

  it("finds Yesterday across month and year boundaries", () => {
    const jan1 = new Date("2026-01-01T20:00:00Z");
    const [group] = groupSpinsByDay([playedAt("2025-12-31T20:00:00Z")], LA, jan1);
    expect(group.label).toBe("Yesterday");
  });

  it("keeps day labels right across a DST transition", () => {
    // US clocks fell back at 2026-11-01 02:00 PDT; that local day is 25 hours long.
    const afterFallBack = new Date("2026-11-02T20:00:00Z"); // Nov 2, 12:00 PST
    const groups = groupSpinsByDay(
      [
        playedAt("2026-11-02T09:00:00Z"), // Nov 2, 01:00 PST
        playedAt("2026-11-01T08:30:00Z"), // Nov 1, 01:30 PDT (first pass)
        playedAt("2026-11-01T09:30:00Z"), // Nov 1, 01:30 PST (repeated hour)
        playedAt("2026-11-01T06:59:00Z"), // Oct 31, 23:59 PDT
      ],
      LA,
      afterFallBack,
    );
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ["Today", 1],
      ["Yesterday", 2],
      ["Saturday, Oct 31", 1],
    ]);
  });

  it("adds the year for spins from another year", () => {
    const [group] = groupSpinsByDay([playedAt("2025-12-31T22:00:00Z")], LA, now);
    expect(group.label).toContain("2025");
  });

  it("returns no groups for no spins", () => {
    expect(groupSpinsByDay([], LA, now)).toEqual([]);
  });
});

describe("formatPlayedAt", () => {
  it("formats in the configured zone", () => {
    const iso = "2026-09-27T06:30:00Z";
    expect(formatPlayedAt(iso, true, "America/Los_Angeles")).toMatch(/11:30\sPM/);
    expect(formatPlayedAt(iso, false, "America/Los_Angeles")).toMatch(/Sep 26, 2026.*11:30\sPM/);
    expect(formatPlayedAt(iso, true, "UTC")).toMatch(/6:30\sAM/);
  });
});
