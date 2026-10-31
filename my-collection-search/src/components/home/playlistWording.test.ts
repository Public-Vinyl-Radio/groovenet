import { describe, expect, it } from "vitest";
import {
  createdLabel,
  draftKicker,
  durationLabel,
  playlistHref,
  tracksAndDuration,
  tracksLabel,
} from "./playlistWording";

const UTC = "UTC";
const now = new Date("2026-10-31T20:00:00.000Z");

describe("tracksLabel", () => {
  it.each([
    [0, "0 TRACKS"],
    [1, "1 TRACK"],
    [24, "24 TRACKS"],
    [1234, "1,234 TRACKS"],
  ])("%i → %s", (count, label) => expect(tracksLabel(count)).toBe(label));
});

describe("durationLabel", () => {
  it.each([
    [0, 1, "0:00:00"],
    [59.6, 1, "0:01:00"],
    [6_312, 1, "1:45:12"],
    [36_000, 1, "10:00:00"],
    [4_120, 0.9, "≈1:08:40"],
    [0, 0, "≈0:00:00"],
  ])("%d s at %d known → %s", (seconds, share, label) =>
    expect(durationLabel(seconds, share)).toBe(label),
  );

  it("joins tracks and duration", () => {
    expect(
      tracksAndDuration({ track_count: 12, duration_seconds: 2_895, duration_known_share: 1 }),
    ).toBe("12 TRACKS · 0:48:15");
  });
});

describe("draftKicker", () => {
  it("names the venue in capitals", () => {
    expect(draftKicker("Club Atlético")).toBe("DRAFT SET · CLUB ATLÉTICO");
  });

  it.each([null, "", "  "])("drops the venue when it is %j", (venue) => {
    expect(draftKicker(venue)).toBe("DRAFT SET");
  });
});

describe("createdLabel", () => {
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

  it.each([
    [0, "CREATED TODAY"],
    [1, "CREATED YESTERDAY"],
    [6, "CREATED 6 DAYS AGO"],
    [7, "CREATED OCT 24"],
  ])("%i days ago → %s", (days, label) =>
    expect(createdLabel(daysAgo(days), UTC, now)).toBe(label),
  );

  it("adds the year for another year", () => {
    expect(createdLabel("2025-12-30T12:00:00.000Z", UTC, now)).toBe("CREATED DEC 30, 2025");
  });

  it("counts days in the display time zone", () => {
    // 06:30 UTC on 31 Oct is still 30 Oct in Los Angeles.
    const at = "2026-10-31T06:30:00.000Z";
    expect(createdLabel(at, UTC, now)).toBe("CREATED TODAY");
    expect(createdLabel(at, "America/Los_Angeles", now)).toBe("CREATED YESTERDAY");
  });

  it("formats an older date in the display time zone", () => {
    // 03:00 UTC on 1 Oct is still 30 Sep in Los Angeles.
    const at = "2026-10-01T03:00:00.000Z";
    expect(createdLabel(at, UTC, now)).toBe("CREATED OCT 1");
    expect(createdLabel(at, "America/Los_Angeles", now)).toBe("CREATED SEP 30");
  });

  it("defaults the clock to now", () => {
    expect(createdLabel(new Date().toISOString(), UTC)).toBe("CREATED TODAY");
  });
});

it("links to the playlist page", () => {
  expect(playlistHref(42)).toBe("/playlists/42");
});
