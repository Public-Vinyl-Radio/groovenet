import { describe, expect, it } from "vitest";
import { player } from "@/test/serverPlayerFixtures";
import { FIXTURE_NOW, vinylDetection } from "@/stories/fixtures/home";
import {
  detectionTime,
  freshDetection,
  pickServerPlayer,
  VINYL_NOW_PLAYING_MAX_AGE_MS,
} from "./nowPlaying";

type Status = ReturnType<typeof player>["state"]["status"];
const withStatus = (id: string, status: Status, patch = {}) => {
  const p = player(id);
  return { ...p, state: { ...p.state, status, ...patch } };
};

const NOW = Date.parse(FIXTURE_NOW);
const detection = vinylDetection;

describe("pickServerPlayer", () => {
  it("picks the playing player and ignores stopped and paused ones", () => {
    const players = [withStatus("lounge", "paused"), withStatus("aswitch", "playing")];
    expect(pickServerPlayer(players, new Map(), null)?.id).toBe("aswitch");
  });

  it("counts loading as playing", () => {
    expect(pickServerPlayer([withStatus("lounge", "loading")], new Map(), null)?.id).toBe("lounge");
  });

  it("takes the most recently updated of several playing players", () => {
    const players = [withStatus("lounge", "playing"), withStatus("aswitch", "playing")];
    expect(pickServerPlayer(players, new Map([["aswitch", 2]]), null)?.id).toBe("aswitch");
    expect(
      pickServerPlayer(
        players,
        new Map([
          ["lounge", 3],
          ["aswitch", 2],
        ]),
        null,
      )?.id,
    ).toBe("lounge");
    // No updates seen yet: the server's own order.
    expect(pickServerPlayer(players, new Map(), null)?.id).toBe("lounge");
  });

  it("keeps the player last shown while it is paused", () => {
    const players = [withStatus("lounge", "paused"), withStatus("aswitch", "stopped")];
    expect(pickServerPlayer(players, new Map(), "lounge")?.id).toBe("lounge");
    expect(pickServerPlayer(players, new Map(), "aswitch")).toBeNull();
    expect(pickServerPlayer(players, new Map(), null)).toBeNull();
  });

  it("drops a paused player with nothing current", () => {
    const players = [withStatus("lounge", "paused", { current_entry_id: null })];
    expect(pickServerPlayer(players, new Map(), "lounge")).toBeNull();
  });

  it("is null with no players", () => {
    expect(pickServerPlayer([], new Map(), "lounge")).toBeNull();
  });
});

describe("freshDetection", () => {
  it("returns the newest matched detection while it is fresh", () => {
    expect(freshDetection([detection()], NOW)?.id).toBe("d1");
  });

  it("skips no-match windows and ones without a resolved track", () => {
    const rows = [
      detection({ id: "none", matched: false, track_id: null, title: null }),
      detection({ id: "gone", title: null }),
      detection({ id: "hit" }),
    ];
    expect(freshDetection(rows, NOW)?.id).toBe("hit");
    expect(freshDetection(rows.slice(0, 2), NOW)).toBeNull();
    expect(freshDetection([], NOW)).toBeNull();
  });

  it("shows a detection exactly at the threshold and hides one a millisecond older", () => {
    const at = (age: number) => detection({ window_start_at: new Date(NOW - age).toISOString() });
    expect(freshDetection([at(VINYL_NOW_PLAYING_MAX_AGE_MS)], NOW)).not.toBeNull();
    expect(freshDetection([at(VINYL_NOW_PLAYING_MAX_AGE_MS + 1)], NOW)).toBeNull();
  });

  it("times a detection by its capture window, else when it was stored", () => {
    expect(detectionTime(detection())).toBe(NOW - 60_000);
    expect(detectionTime(detection({ window_start_at: null }))).toBe(NOW - 50_000);
  });
});
