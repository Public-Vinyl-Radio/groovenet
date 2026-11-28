import { afterEach, describe, expect, it, vi } from "vitest";
import { audioLabel, playlistOwner, printPlaylists, printTrack, printTracks } from "./output.js";

afterEach(() => vi.restoreAllMocks());

function printed(track: Parameters<typeof printTrack>[0]): string {
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  printTrack(track, false);
  return log.mock.calls.map((call) => call.join(" ")).join("\n");
}

describe("printTrack ratings (#1283)", () => {
  it("shows your rating and every other profile's, read-only", () => {
    const out = printed({
      track_id: "t1",
      title: "Song",
      artist: "Artist",
      star_rating: 5,
      other_ratings: [
        { user_id: "u2", name: "Sam", rating: 3 },
        { user_id: "u3", name: "Jo", rating: 4 },
      ],
    });
    expect(out).toContain("★5/5");
    expect(out).toContain("Others' Ratings:");
    expect(out).toContain("Sam ★3, Jo ★4");
  });

  it("leaves the line out when no one else has rated it", () => {
    const out = printed({ track_id: "t1", title: "Song", artist: "Artist", other_ratings: [] });
    expect(out).not.toContain("Others' Ratings");
  });
});

describe("playlist owners (#1284)", () => {
  it("names the owner, marks private, and copes with an older server", () => {
    expect(playlistOwner({ owner_name: "Sam", visibility: "household" })).toBe("Sam");
    expect(playlistOwner({ owner_name: "Sam", visibility: "private" })).toBe("Sam (private)");
    expect(playlistOwner({})).toBe("-");
  });

  it("lists the owner column", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    printPlaylists(
      [{ id: 1, name: "Mix", created_at: "2026-01-01", tracks: [], owner_name: "Sam" }],
      false,
    );
    const out = log.mock.calls.flat().join("\n");
    expect(out).toContain("Owner");
    expect(out).toContain("Sam");
  });
});

describe("track tables (#1327)", () => {
  it("labels whether the player can play a track, by the NO_AUDIO rule", () => {
    expect(audioLabel({ local_audio_url: "a.mp3" })).toContain("yes");
    for (const missing of [undefined, null, "", "  "])
      expect(audioLabel({ local_audio_url: missing })).toContain("no");
  });

  it("adds Friend and Audio columns", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    printTracks(
      [
        { track_id: "t1", title: "Has", artist: "A", friend_id: 6, local_audio_url: "a.mp3" },
        { track_id: "t2", title: "Lacks", artist: "A" },
      ] as Parameters<typeof printTracks>[0],
      false,
    );
    const table = String(log.mock.calls[0]![0]).replace(/\u001b\[[0-9;]*m/g, "");
    expect(table).toMatch(/Friend\s*│\s*Audio/);
    expect(table).toMatch(/Has[\s\S]*6\s*│\s*yes/);
    expect(table).toMatch(/Lacks[\s\S]*-\s*│\s*no/);
  });
});
