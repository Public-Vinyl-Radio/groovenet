import { describe, expect, it } from "vitest";
import { suggestionReason, suggestionReasonLabel } from "./suggestionReason";

const seed = {
  artist: "Ana",
  album: "Night",
  release_id: "1",
  friend_id: 1,
  track_genres: [{ name: "Cumbia", slug: "cumbia" }],
};
const other = { artist: "Bo", album: "Day", release_id: "2", friend_id: 1 };

describe("suggestionReason", () => {
  it("prefers same album over everything", () => {
    expect(
      suggestionReason(seed, { ...seed, _simAudio: 0.9, track_genres: seed.track_genres }),
    ).toEqual({ kind: "album" });
  });
  it("matches an album by name and artist when release ids are missing", () => {
    const bare = { artist: "Ana", album: "night", friend_id: 1 };
    expect(suggestionReason({ ...bare, album: "Night" }, bare)).toEqual({ kind: "album" });
  });
  it("does not match a blank album", () => {
    const bare = { artist: "X", album: "", friend_id: 1 };
    expect(suggestionReason(bare, { ...bare, artist: "Y" })).toBeNull();
  });
  it("does not match the same release id in another library", () => {
    expect(
      suggestionReason(seed, { ...seed, artist: "Zed", friend_id: 2, track_genres: [] }),
    ).toBeNull();
  });
  it("then same artist", () => {
    expect(suggestionReason(seed, { ...other, artist: " ana ", _simAudio: 0.9 })).toEqual({
      kind: "artist",
    });
  });
  it("then similar sound over a shared genre", () => {
    expect(
      suggestionReason(seed, { ...other, _simAudio: 0.5, track_genres: seed.track_genres }),
    ).toEqual({ kind: "sound" });
  });
  it("then a shared reconciled genre", () => {
    expect(
      suggestionReason(seed, {
        ...other,
        _simIdentity: 0.8,
        track_genres: [{ name: "Cumbia", slug: "cumbia" }],
      }),
    ).toEqual({ kind: "genre", name: "Cumbia" });
  });
  it("ignores unreconciled genres and non-overlap", () => {
    expect(
      suggestionReason(seed, { ...other, track_genres: [{ name: "Cumbia", slug: null }] }),
    ).toBeNull();
    expect(suggestionReason(seed, other)).toBeNull();
  });
  it("copes with missing fields", () => {
    const bare = { artist: "", album: null as unknown as string, friend_id: 1 };
    expect(suggestionReason(bare, bare)).toBeNull();
  });
  it("labels each reason", () => {
    expect(suggestionReasonLabel({ kind: "album" })).toBe("Same album");
    expect(suggestionReasonLabel({ kind: "artist" })).toBe("Same artist");
    expect(suggestionReasonLabel({ kind: "sound" })).toBe("Similar sound");
    expect(suggestionReasonLabel({ kind: "genre", name: "Cumbia" })).toBe("Genre: Cumbia");
  });
});
