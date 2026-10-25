import { describe, expect, it } from "vitest";
import type { Playlist } from "@/types/track";
import {
  formatGroupCount,
  groupPlaylistsByMonth,
  playlistDayParts,
  playlistTimelineDate,
} from "./playlistGroups";

const pl = (id: number, created_at: string | undefined, performed?: string) =>
  ({
    id,
    name: `P${id}`,
    tracks: [],
    created_at,
    ...(performed !== undefined
      ? { set: { last_performed_at: performed } }
      : {}),
  }) as unknown as Playlist;

describe("playlistTimelineDate", () => {
  it("prefers the played date over created", () => {
    expect(
      playlistTimelineDate(
        pl(1, "2026-01-01T12:00:00", "2026-03-05T12:00:00"),
      )?.getMonth(),
    ).toBe(2);
  });

  it("falls back to created when the set was never played", () => {
    expect(
      playlistTimelineDate(pl(1, "2026-01-01T12:00:00", ""))?.getMonth(),
    ).toBe(0);
  });

  it("is null for missing or invalid dates", () => {
    expect(playlistTimelineDate(pl(1, undefined))).toBeNull();
    expect(playlistTimelineDate(pl(1, "nope"))).toBeNull();
  });
});

describe("playlistDayParts", () => {
  it("gives day and weekday", () => {
    expect(playlistDayParts(pl(1, "2026-08-10T12:00:00"))).toEqual({
      day: "10",
      weekday: "MON",
    });
  });

  it("is null without a date", () => {
    expect(playlistDayParts(pl(1, undefined))).toBeNull();
  });
});

describe("groupPlaylistsByMonth", () => {
  it("is empty for no playlists", () => {
    expect(groupPlaylistsByMonth([])).toEqual([]);
  });

  it("groups by month, newest first, across years", () => {
    const groups = groupPlaylistsByMonth([
      pl(1, "2025-12-31T12:00:00"),
      pl(2, "2026-08-01T12:00:00"),
      pl(3, "2026-08-10T12:00:00"),
      pl(4, "2026-01-15T12:00:00"),
    ]);
    expect(groups.map((g) => g.label)).toEqual([
      "AUG 2026",
      "JAN 2026",
      "DEC 2025",
    ]);
    expect(groups[0].key).toBe("2026-08");
    expect(groups[0].playlists.map((p) => p.id)).toEqual([3, 2]);
  });

  it("counts sets and places them by played date", () => {
    const [group] = groupPlaylistsByMonth([
      pl(1, "2026-01-01T12:00:00", "2026-08-10T12:00:00"),
      pl(2, "2026-08-02T12:00:00"),
      pl(3, "2026-08-03T12:00:00", "2026-08-03T12:00:00"),
    ]);
    expect(group.playlistCount).toBe(3);
    expect(group.setCount).toBe(2);
  });

  it("puts undated playlists in a trailing group", () => {
    const groups = groupPlaylistsByMonth([
      pl(1, undefined),
      pl(2, "2026-08-10T12:00:00"),
      pl(3, "bad"),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["AUG 2026", "UNDATED"]);
    expect(groups[1].playlists.map((p) => p.id)).toEqual([1, 3]);
  });
});

describe("formatGroupCount", () => {
  it("pluralises and drops a zero set count", () => {
    expect(formatGroupCount({ playlistCount: 2, setCount: 2 })).toBe(
      "2 playlists · 2 sets",
    );
    expect(formatGroupCount({ playlistCount: 1, setCount: 1 })).toBe(
      "1 playlist · 1 set",
    );
    expect(formatGroupCount({ playlistCount: 3, setCount: 0 })).toBe(
      "3 playlists",
    );
  });
});
