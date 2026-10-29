import { describe, it, expect } from "vitest";
import { cleanSoundcloudUrl } from "../url";

describe("cleanSoundcloudUrl", () => {
  it("returns undefined when called with no argument", () => {
    expect(cleanSoundcloudUrl()).toBeUndefined();
  });

  it("returns undefined when called with undefined", () => {
    expect(cleanSoundcloudUrl(undefined)).toBeUndefined();
  });

  it("returns empty string when called with empty string", () => {
    // url is falsy → returns url (which is "")
    expect(cleanSoundcloudUrl("")).toBe("");
  });

  it("strips query string from URL", () => {
    expect(cleanSoundcloudUrl("https://soundcloud.com/artist/track?in=playlist&si=abc")).toBe(
      "https://soundcloud.com/artist/track",
    );
  });

  it("strips hash fragment from URL", () => {
    expect(cleanSoundcloudUrl("https://soundcloud.com/artist/track#comments")).toBe(
      "https://soundcloud.com/artist/track",
    );
  });

  it("strips both query and hash", () => {
    expect(cleanSoundcloudUrl("https://soundcloud.com/artist/track?foo=bar#baz")).toBe(
      "https://soundcloud.com/artist/track",
    );
  });

  it("leaves clean URL unchanged", () => {
    expect(cleanSoundcloudUrl("https://soundcloud.com/artist/track")).toBe(
      "https://soundcloud.com/artist/track",
    );
  });

  it("preserves trailing slash on the path", () => {
    expect(cleanSoundcloudUrl("https://soundcloud.com/artist/track/?foo=bar")).toBe(
      "https://soundcloud.com/artist/track/",
    );
  });

  it("returns the original string for an invalid URL (no throw)", () => {
    const invalid = "not a url at all";
    expect(cleanSoundcloudUrl(invalid)).toBe(invalid);
  });

  it("works with http URLs", () => {
    expect(cleanSoundcloudUrl("http://soundcloud.com/artist/track?ref=1")).toBe(
      "http://soundcloud.com/artist/track",
    );
  });
});
