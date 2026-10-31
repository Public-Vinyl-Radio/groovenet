import { describe, expect, it } from "vitest";
import {
  describeNeighbour,
  describeSessionPosition,
  describeSpinHeadline,
  describeSpinLogging,
  describeTrackPlays,
  findSpinSelection,
  formatLoggedAt,
  formatSpinDate,
  spinNeighbours,
} from "./spinSelection";
import { groupListeningLog, spinPlays, type SpinListItem, type SpinPlay } from "./spinSummary";

const UTC = "UTC";
const NOW = new Date("2026-10-31T12:00:00Z");

function item(
  session: Partial<SpinListItem["session"]> = {},
  positions: string[] = ["A1", "A2", "A3"],
): SpinListItem {
  const playedAt = "2026-10-27T19:00:00.000Z";
  return {
    session: {
      id: 9,
      friend_id: 7,
      release_id: "r1",
      medium: "vinyl",
      selection_mode: "tracks",
      played_at: playedAt,
      provenance: "manual",
      created_at: playedAt,
      updated_at: playedAt,
      ...session,
    },
    selections: [],
    track_events: positions.map((position, ordinal) => ({
      friend_id: 7,
      release_id: "r1",
      track_id: `r1-${position}`,
      played_at: new Date(Date.parse(playedAt) + ordinal * 5 * 60_000).toISOString(),
      ordinal,
      position_snapshot: position,
      title_snapshot: `Song ${position}`,
    })),
    album: { title: "Innerspeaker", artist: "Tame Impala", thumbnail: null },
    derived: {
      is_full_album_spin: false,
      selected_side_count: 0,
      album_side_count: 0,
      track_count: positions.length,
    },
  };
}

const firstPlay = (session: Partial<SpinListItem["session"]> = {}): SpinPlay =>
  spinPlays(item(session))[0];

describe("findSpinSelection", () => {
  const days = groupListeningLog([item()], UTC, NOW);

  it("finds a play and its place in the session, newest first", () => {
    const selection = findSpinSelection(days, "9:1");
    expect(selection?.play.position).toBe("A2");
    expect(selection?.index).toBe(1);
    expect(selection?.session.plays).toHaveLength(3);
  });

  it("is null for no key or an unknown one", () => {
    expect(findSpinSelection(days, null)).toBeNull();
    expect(findSpinSelection(days, "nope")).toBeNull();
    expect(findSpinSelection([], "9:1")).toBeNull();
  });
});

describe("session position and neighbours", () => {
  const days = groupListeningLog([item()], UTC, NOW);
  const at = (key: string) => findSpinSelection(days, key)!;

  it("has nothing before the session's first spin", () => {
    const first = at("9:0");
    expect(spinNeighbours(first).before).toBeNull();
    expect(spinNeighbours(first).after?.position).toBe("A2");
    expect(describeSessionPosition(first, UTC)).toMatch(/^Spin 1 of 3 · 7:00\sPM–7:10\sPM$/);
  });

  it("has both around a middle spin", () => {
    const middle = spinNeighbours(at("9:1"));
    expect(middle.before?.position).toBe("A1");
    expect(middle.after?.position).toBe("A3");
  });

  it("has nothing after the session's last spin", () => {
    const last = at("9:2");
    expect(spinNeighbours(last).after).toBeNull();
    expect(describeSessionPosition(last, UTC)).toMatch(/^Spin 3 of 3/);
  });

  it("names a neighbour by time, position and title", () => {
    expect(describeNeighbour(at("9:1").play, UTC)).toMatch(/^7:05\sPM · A2 · Song A2$/);
  });
});

describe("describeSpinLogging", () => {
  it("credits an automatic vinyl spin to detection, and asks for fixes", () => {
    expect(describeSpinLogging(firstPlay({ provenance: "automatic" }))).toEqual({
      source: "Vinyl",
      loggedBy: "Auto-detected",
      note: "Picked up from the turntable automatically. Wrong track or side? Fix it below.",
    });
  });

  it("says when a detected spin was corrected", () => {
    const logging = describeSpinLogging(
      firstPlay({ provenance: "automatic", corrected_at: "2026-10-28T00:00:00Z" }),
    );
    expect(logging.loggedBy).toBe("Auto-detected");
    expect(logging.note).toMatch(/then corrected by hand/);
  });

  it("credits a manual spin to a manual entry", () => {
    expect(describeSpinLogging(firstPlay())).toEqual({
      source: "Vinyl",
      loggedBy: "Manual entry",
      note: "Logged by hand.",
    });
  });

  it("credits a playlist spin to the playlist", () => {
    expect(describeSpinLogging(firstPlay({ provenance: "playlist" })).loggedBy).toBe("Playlist");
  });

  it("describes a named player output without inferring its backend", () => {
    expect(
      describeSpinLogging(
        firstPlay({ medium: "digital", context_type: "player", output_name: "Lounge" }),
      ).note,
    ).toBe("Logged when the player played it on Lounge.");
    expect(
      describeSpinLogging(
        firstPlay({ medium: "digital", context_type: "player", output_name: null }),
      ).note,
    ).toBeNull();
    expect(
      describeSpinLogging(firstPlay({ medium: "digital", output_name: "Lounge" })).note,
    ).toBeNull();
  });

  it("credits a digital play to the player without an output", () => {
    expect(describeSpinLogging(firstPlay({ medium: "digital" }))).toEqual({
      source: "Digital",
      loggedBy: "Player",
      note: null,
    });
  });
});

describe("dates", () => {
  it("leaves out this year and keeps another", () => {
    expect(formatSpinDate("2026-10-27T19:00:00Z", UTC, NOW)).toBe("Tue Oct 27");
    expect(formatSpinDate("2025-10-27T19:00:00Z", UTC, NOW)).toBe("Mon Oct 27 2025");
  });

  it("formats when a spin was logged in the configured zone", () => {
    expect(formatLoggedAt("2026-10-28T02:38:00Z", "America/Los_Angeles", NOW)).toMatch(
      /^Tue Oct 27 · 7:38\sPM$/,
    );
  });
});

describe("describeSpinHeadline", () => {
  it("joins the library identifier and the vinyl side", () => {
    expect(describeSpinHeadline(firstPlay(), "LP-342")).toBe("LP-342 · SIDE A3");
  });

  it("gives a digital play its bare position", () => {
    expect(describeSpinHeadline(firstPlay({ medium: "digital" }), "LP-342")).toBe("LP-342 · A3");
  });

  it("keeps what there is, or nothing", () => {
    expect(describeSpinHeadline(firstPlay(), null)).toBe("SIDE A3");
    const summary = spinPlays({ ...item(), track_events: [] })[0];
    expect(describeSpinHeadline(summary, "LP-1")).toBe("LP-1");
    expect(describeSpinHeadline(summary, undefined)).toBeNull();
  });
});

describe("describeTrackPlays", () => {
  it("counts plays and names the last", () => {
    expect(
      describeTrackPlays({ play_count: 4, last_played_at: "2026-10-27T19:00:00Z" }, UTC, NOW),
    ).toBe("4× PLAYED · LAST OCT 27");
    expect(
      describeTrackPlays({ play_count: 1, last_played_at: "2025-01-02T19:00:00Z" }, UTC, NOW),
    ).toBe("1× PLAYED · LAST JAN 2 2025");
  });

  it("has no last play for a track never spun", () => {
    expect(describeTrackPlays({ play_count: 0, last_played_at: null }, UTC, NOW)).toBe("0× PLAYED");
  });
});
