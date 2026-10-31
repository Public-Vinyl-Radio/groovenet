import { describe, expect, it } from "vitest";
import {
  describeProvenance,
  describeSpinAlbum,
  formatPlayedAt,
  formatPositionRange,
  formatTimeRange,
  groupListeningLog,
  groupListeningSessions,
  groupSpinsByDay,
  LISTENING_SESSION_GAP_MS,
  spinPlays,
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

// ── Listening log ───────────────────────────────────────────────────────────

let logId = 0;

/** A one-record spin session, its tracks played `minutes` apart from `start`. */
function logged(
  start: string,
  options: {
    release?: string;
    medium?: "vinyl" | "digital";
    tracks?: string[];
    minutes?: number;
    album?: { title: string | null; artist: string | null; thumbnail: string | null } | null;
  } = {},
): SpinListItem {
  const id = ++logId;
  const release = options.release ?? "r1";
  const step = (options.minutes ?? 4) * 60_000;
  const events = (options.tracks ?? ["A1"]).map((position, ordinal) => ({
    friend_id: 1,
    release_id: release,
    track_id: `${release}-${position}`,
    played_at: new Date(Date.parse(start) + ordinal * step).toISOString(),
    ordinal,
    side_key: position[0],
    position_snapshot: position,
    title_snapshot: `Track ${position}`,
    artist_snapshot: `Artist ${release}`,
    album_snapshot: `Album ${release}`,
  }));
  const item = spin({ events });
  return {
    ...item,
    session: {
      ...item.session,
      id,
      release_id: release,
      medium: options.medium ?? "vinyl",
      played_at: start,
    },
    ...(options.album !== undefined ? { album: options.album } : {}),
  };
}

const at = (time: string) => `2026-10-27T${time}:00.000Z`;

describe("spinPlays", () => {
  it("gives one play per track event, newest first, from the event snapshots", () => {
    const plays = spinPlays(logged(at("19:00"), { tracks: ["A1", "A2", "A3"] }));
    expect(plays.map((p) => p.position)).toEqual(["A3", "A2", "A1"]);
    expect(plays[0]).toMatchObject({
      trackId: "r1-A3",
      title: "Track A3",
      artist: "Artist r1",
      record: "Album r1",
      medium: "vinyl",
      thumbnail: null,
    });
  });

  it("prefers the album row and orders same-time tracks by ordinal", () => {
    const item = logged(at("19:00"), {
      tracks: ["B1", "B2"],
      minutes: 0,
      album: { title: "Garra", artist: "Marcos Valle", thumbnail: "art.jpg" },
    });
    const plays = spinPlays(item);
    expect(plays.map((p) => p.position)).toEqual(["B2", "B1"]);
    expect(plays[0]).toMatchObject({
      record: "Garra",
      artist: "Marcos Valle",
      thumbnail: "art.jpg",
    });
  });

  it("falls back to the session summary when it has no track events", () => {
    const item = { ...logged(at("19:00")), track_events: [] };
    expect(spinPlays(item)).toEqual([
      expect.objectContaining({
        key: String(item.session.id),
        trackId: null,
        position: null,
        title: "No tracks recorded",
        playedAt: at("19:00"),
        record: null,
      }),
    ]);
  });

  it("names an untitled event", () => {
    const item = logged(at("19:00"));
    item.track_events[0].title_snapshot = "";
    item.track_events[0].position_snapshot = undefined;
    item.track_events[0].artist_snapshot = undefined;
    item.track_events[0].album_snapshot = undefined;
    expect(spinPlays(item)[0]).toMatchObject({
      title: "Unknown track",
      position: null,
      artist: null,
      record: null,
    });
  });
});

describe("groupListeningSessions", () => {
  it("uses a 20 minute gap", () => {
    expect(LISTENING_SESSION_GAP_MS).toBe(20 * 60_000);
  });

  it("keeps plays exactly 20 minutes apart together and splits at 21", () => {
    const together = groupListeningSessions([
      logged(at("19:20"), { release: "r2" }),
      logged(at("19:00")),
    ]);
    expect(together).toHaveLength(1);

    const apart = groupListeningSessions([
      logged(at("19:21"), { release: "r2" }),
      logged(at("19:00")),
    ]);
    expect(apart.map((s) => [s.start, s.end])).toEqual([
      [at("19:21"), at("19:21")],
      [at("19:00"), at("19:00")],
    ]);
  });

  it("measures the gap from the last track, not the session start", () => {
    // A 3-track side starting at 19:00 ends at 19:08; 19:25 is 17 minutes later.
    const sessions = groupListeningSessions([
      logged(at("19:25"), { release: "r2" }),
      logged(at("19:00"), { tracks: ["A1", "A2", "A3"] }),
    ]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ start: at("19:00"), end: at("19:25") });
    expect(sessions[0].plays).toHaveLength(4);
    expect(sessions[0].recordCount).toBe(2);
  });

  it("calls a session with both media mixed", () => {
    const [mixed] = groupListeningSessions([
      logged(at("19:10"), { release: "r2", medium: "digital" }),
      logged(at("19:00")),
    ]);
    expect(mixed.medium).toBe("mixed");
    const [digital] = groupListeningSessions([logged(at("19:00"), { medium: "digital" })]);
    expect(digital.medium).toBe("digital");
  });

  it("collapses consecutive plays of one record and splits a run another record interrupts", () => {
    const [session] = groupListeningSessions([
      logged(at("19:30"), { tracks: ["A3"] }),
      logged(at("19:20"), { release: "r2", tracks: ["B1"] }),
      logged(at("19:00"), { tracks: ["A1", "A2"] }),
    ]);
    expect(session.records.map((g) => [g.releaseId, g.plays.map((p) => p.position)])).toEqual([
      ["r1", ["A3"]],
      ["r2", ["B1"]],
      ["r1", ["A2", "A1"]],
    ]);
    expect(session.recordCount).toBe(2);
  });

  it("keeps the same record on two media apart", () => {
    const [session] = groupListeningSessions([
      logged(at("19:05"), { medium: "digital", tracks: ["A2"] }),
      logged(at("19:00"), { tracks: ["A1"] }),
    ]);
    expect(session.records).toHaveLength(2);
  });

  it("returns nothing for no spins", () => {
    expect(groupListeningSessions([])).toEqual([]);
  });
});

describe("groupListeningLog", () => {
  const now = new Date("2026-10-28T20:00:00Z");

  it("buckets days in Los Angeles from UTC timestamps", () => {
    // 02:00 UTC on Oct 28 is 7 PM on Oct 27 in Los Angeles.
    const days = groupListeningLog(
      [logged("2026-10-28T02:00:00Z"), logged("2026-10-26T18:00:00Z", { release: "r2" })],
      "America/Los_Angeles",
      now,
    );
    expect(days.map((d) => [d.label, d.date])).toEqual([
      ["Yesterday", "TUE OCT 27"],
      ["Monday", "MON OCT 26"],
    ]);
    expect(groupListeningLog([logged("2026-10-28T02:00:00Z")], "UTC", now)[0].label).toBe("Today");
  });

  it("files a session across midnight under the day it started", () => {
    // 23:50 and 00:05 the next day in Los Angeles, 15 minutes apart.
    const days = groupListeningLog(
      [logged("2026-10-27T07:05:00Z", { release: "r2" }), logged("2026-10-27T06:50:00Z")],
      "America/Los_Angeles",
      now,
    );
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ date: "MON OCT 26", spinCount: 2, recordCount: 2 });
    expect(days[0].sessions).toHaveLength(1);
  });

  it("counts a day's spins and distinct records across sessions", () => {
    const [day] = groupListeningLog(
      [
        logged(at("21:00")),
        logged(at("19:00"), { tracks: ["A1", "A2"] }),
        logged(at("18:00"), { release: "r2" }),
      ],
      "UTC",
      now,
    );
    expect(day.sessions).toHaveLength(3);
    expect(day.spinCount).toBe(4);
    expect(day.recordCount).toBe(2);
  });

  it("adds the year to a day from another year", () => {
    const [day] = groupListeningLog([logged("2025-12-31T12:00:00Z")], "UTC", now);
    expect(day).toMatchObject({ label: "Wednesday", date: "WED DEC 31 2025" });
  });
});

describe("time and position ranges", () => {
  it("formats a range in the configured zone, or one time", () => {
    expect(formatTimeRange(at("02:16"), at("02:38"), "America/Los_Angeles")).toMatch(
      /^7:16\sPM–7:38\sPM$/,
    );
    expect(formatTimeRange(at("19:00"), at("19:00"), "UTC")).toMatch(/^7:00\sPM$/);
  });

  it("spans the first and last known positions", () => {
    const plays = spinPlays(logged(at("19:00"), { tracks: ["A1", "A2", "A3"] }));
    expect(formatPositionRange(plays)).toBe("A1–A3");
    expect(formatPositionRange(plays.slice(0, 1))).toBe("A3");
    expect(formatPositionRange([{ ...plays[0], position: null }])).toBeNull();
  });
});
