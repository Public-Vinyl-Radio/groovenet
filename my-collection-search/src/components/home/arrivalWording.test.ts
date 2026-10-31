import { describe, expect, it } from "vitest";
import {
  addedLabel,
  arrivalHref,
  arrivalsCaption,
  daysSince,
  playsLabel,
  ratingChip,
} from "./arrivalWording";

describe("playsLabel", () => {
  it.each([
    [0, "NOT PLAYED"],
    [1, "1 PLAY"],
    [2, "2 PLAYS"],
    [1234, "1,234 PLAYS"],
  ])("%i → %s", (count, label) => expect(playsLabel(count)).toBe(label));
});

describe("ratingChip", () => {
  it("is an inverted-chip UNRATED for null and for the column's 0 default", () => {
    for (const rating of [null, 0]) {
      expect(ratingChip(rating)).toEqual({
        label: "UNRATED",
        rated: false,
        description: "Unrated",
      });
    }
  });

  it("fills stars to the rating and describes it in words", () => {
    expect(ratingChip(4)).toEqual({ label: "★★★★☆", rated: true, description: "Rated 4 of 5" });
    expect(ratingChip(1).label).toBe("★☆☆☆☆");
  });

  it("caps a stray value at five stars", () => {
    expect(ratingChip(9)).toEqual({ label: "★★★★★", rated: true, description: "Rated 5 of 5" });
  });
});

describe("addedLabel", () => {
  const LA = "America/Los_Angeles";
  // 22:30 on 31 October in Los Angeles; UTC is already 1 November.
  const now = new Date("2026-11-01T05:30:00.000Z");

  it("says TODAY for the same calendar day in the zone, even across UTC midnight", () => {
    // 00:30 on 31 October in Los Angeles.
    expect(addedLabel("2026-10-31T07:30:00.000Z", LA, now)).toBe("ADDED TODAY");
  });

  it("says YESTERDAY one minute after local midnight, not 24 hours later", () => {
    // 23:59 on 30 October in Los Angeles, 22h31m before `now`.
    expect(addedLabel("2026-10-31T06:59:00.000Z", LA, now)).toBe("ADDED YESTERDAY");
  });

  it("counts calendar days, not elapsed hours", () => {
    // 20:00 on 28 October in Los Angeles: 74 hours, three calendar days.
    expect(addedLabel("2026-10-29T03:00:00.000Z", LA, now)).toBe("ADDED 3 DAYS AGO");
  });

  it("uses the zone's day, not UTC's", () => {
    expect(addedLabel("2026-10-31T23:00:00.000Z", "UTC", now)).toBe("ADDED YESTERDAY");
    expect(addedLabel("2026-10-31T23:00:00.000Z", LA, now)).toBe("ADDED TODAY");
  });

  it("never goes negative when the clock is behind", () => {
    expect(daysSince("2026-11-05T00:00:00.000Z", "UTC", now)).toBe(0);
  });

  it("defaults to the current time", () => {
    expect(addedLabel(new Date().toISOString(), "UTC")).toBe("ADDED TODAY");
  });
});

describe("arrivalsCaption", () => {
  it("reads like the mock on desktop and phone", () => {
    expect(arrivalsCaption(3, 30, "desktop")).toBe("last 30 days · least played first · 3 unrated");
    expect(arrivalsCaption(3, 30, "phone")).toBe("LEAST PLAYED · 3 UNRATED");
  });

  it("leaves the unrated part out at zero", () => {
    expect(arrivalsCaption(0, 30, "desktop")).toBe("last 30 days · least played first");
    expect(arrivalsCaption(0, 30, "phone")).toBe("LEAST PLAYED");
  });
});

describe("arrivalHref", () => {
  it("carries the friend, as other album links do", () => {
    expect(arrivalHref("123", 7)).toBe("/albums/123?friend_id=7");
  });
});
