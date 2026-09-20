import { describe, expect, it } from "vitest";
import { exampleForProperty } from "./propertyExamples";

describe("exact names", () => {
  it.each([
    ["message", "string", "Done"],
    ["error", "string", "Track not found"],
    ["track_id", "string", "trk_001"],
    ["friend_id", "integer", 1],
    ["title", "string", "Move Through"],
    ["bpm", "number", 122],
    ["success", "boolean", true],
  ])("resolves %s", (name, type, expected) => {
    expect(exampleForProperty(name, type)).toEqual(expected);
  });

  it("returns undefined for an unknown name", () => {
    expect(exampleForProperty("wibble", "string")).toBeUndefined();
  });

  it("returns undefined when no name is given", () => {
    expect(exampleForProperty(undefined, "string")).toBeUndefined();
  });
});

describe("case normalisation", () => {
  it.each(["trackId", "TrackId", "track_id", "TRACK_ID"])(
    "treats %s as track_id",
    (name) => {
      expect(exampleForProperty(name, "string")).toBe("trk_001");
    }
  );

  it("normalises a multi-word camelCase name", () => {
    expect(exampleForProperty("seedTrackId", "string")).toBe("trk_001");
    expect(exampleForProperty("estimatedTotalHits", "integer")).toBe(137);
  });
});

describe("suffix rules", () => {
  it.each([
    ["cover_url", "string", "https://example.com/resource"],
    ["created_at", "string", "2026-02-17T12:00:00.000Z"],
    ["duration_seconds", "integer", 213],
    ["track_count", "integer", 3],
    ["star_rating", "integer", 4],
    ["audio_format", "string", "m4a"],
  ])("resolves %s by suffix", (name, type, expected) => {
    expect(exampleForProperty(name, type)).toEqual(expected);
  });

  it("prefers an exact match over a suffix match", () => {
    // `track_id` is in the table; the generic `_id` rule would give "1".
    expect(exampleForProperty("track_id", "string")).toBe("trk_001");
  });

  it("gives an unknown *_id a number when the schema wants one", () => {
    expect(exampleForProperty("widget_id", "integer")).toBe(1);
  });

  it("gives an unknown *_id a string when the schema wants one", () => {
    expect(exampleForProperty("widget_id", "string")).toBe("1");
  });
});

describe("multiple candidates", () => {
  it("picks the string form when the schema wants a string", () => {
    expect(exampleForProperty("duration", "string")).toBe("5:30");
  });

  it("picks the numeric form when the schema wants a number", () => {
    expect(exampleForProperty("duration", "number")).toBe(213);
  });

  it("returns undefined when no candidate fits", () => {
    expect(exampleForProperty("duration", "boolean")).toBeUndefined();
  });
});

describe("date_ prefix", () => {
  it.each(["date_added", "date_changed", "dateAdded"])(
    "treats %s as a timestamp",
    (name) => {
      expect(exampleForProperty(name, "string")).toBe("2026-02-17T12:00:00.000Z");
    }
  );

  it("declines the date prefix when a number is required", () => {
    expect(exampleForProperty("date_added", "integer")).toBeUndefined();
  });
});

describe("type agreement", () => {
  it("declines a value that does not fit the declared type", () => {
    // `title` is a string; a numeric schema must not receive it.
    expect(exampleForProperty("title", "integer")).toBeUndefined();
  });

  it("declines a float where an integer is required", () => {
    expect(exampleForProperty("danceability", "integer")).toBeUndefined();
  });

  it("accepts an integer where a number is required", () => {
    expect(exampleForProperty("friend_id", "number")).toBe(1);
  });

  it("accepts a value for a nullable union", () => {
    expect(exampleForProperty("track_id", ["string", "null"])).toBe("trk_001");
  });

  it("declines when every non-null branch mismatches", () => {
    expect(exampleForProperty("title", ["integer", "null"])).toBeUndefined();
  });

  it("accepts anything when the schema declares no type", () => {
    expect(exampleForProperty("message", undefined)).toBe("Done");
  });

  it("declines an exotic declared type", () => {
    // e.g. type: "object" — no table value is a valid example for one.
    expect(exampleForProperty("message", "object")).toBeUndefined();
  });

  it("accepts anything when the schema declares only null", () => {
    expect(exampleForProperty("message", ["null"])).toBe("Done");
  });
});
