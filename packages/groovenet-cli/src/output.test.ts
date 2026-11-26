import { afterEach, describe, expect, it, vi } from "vitest";
import { playlistOwner, printPlaylists, printTrack } from "./output.js";

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
