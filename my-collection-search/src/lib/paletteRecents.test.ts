// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Album, Track } from "@/types/track";
import {
  RECENT_CAP,
  readRecentOpens,
  readRecentSearches,
  recordRecentOpen,
  recordRecentSearch,
} from "./paletteRecents";

const track = (id: string) =>
  ({
    track_id: id,
    friend_id: 1,
    title: id,
    artist: "A",
    embedding: [1, 2, 3],
  }) as unknown as Track;

describe("palette recents (#1145)", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("puts the latest first, drops duplicates, keeps only row fields and caps the list", () => {
    for (let i = 0; i < RECENT_CAP + 3; i++)
      recordRecentOpen({ kind: "track", track: track(`t${i}`) });
    recordRecentOpen({ kind: "track", track: track("t5") });
    recordRecentOpen({
      kind: "album",
      album: {
        release_id: "r",
        friend_id: 1,
        title: "R",
        artist: "A",
        junk: 1,
      } as unknown as Album,
    });
    const opens = readRecentOpens();
    expect(opens).toHaveLength(RECENT_CAP);
    expect(opens[0]).toMatchObject({ kind: "album" });
    expect(JSON.stringify(opens[0])).not.toContain("junk");
    expect(opens.filter((o) => o.kind === "track" && o.track.track_id === "t5")).toHaveLength(1);
    expect(JSON.stringify(opens)).not.toContain("embedding");
  });

  it("records searches case-insensitively without duplicates and ignores blanks", () => {
    recordRecentSearch("Slowdive");
    recordRecentSearch("  ");
    recordRecentSearch("slowdive");
    recordRecentSearch("ride");
    expect(readRecentSearches()).toEqual(["ride", "slowdive"]);
  });

  it("ignores malformed stored values", () => {
    window.localStorage.setItem(
      "groovenet:palette:recent-opens",
      JSON.stringify([
        null,
        { kind: "x" },
        { kind: "track" },
        { kind: "album", album: { release_id: "r" } },
      ]),
    );
    window.localStorage.setItem("groovenet:palette:recent-searches", JSON.stringify(["ok", 3, ""]));
    expect(readRecentOpens()).toHaveLength(1);
    expect(readRecentSearches()).toEqual(["ok"]);
    window.localStorage.setItem("groovenet:palette:recent-searches", "{not json");
    expect(readRecentSearches()).toEqual([]);
    window.localStorage.setItem("groovenet:palette:recent-searches", "{}");
    expect(readRecentSearches()).toEqual([]);
  });

  it("survives storage throwing", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    expect(readRecentOpens()).toEqual([]);
    expect(() => recordRecentSearch("x")).not.toThrow();
    expect(() => recordRecentOpen({ kind: "track", track: track("a") })).not.toThrow();
  });
});
