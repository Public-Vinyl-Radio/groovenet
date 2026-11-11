import { describe, expect, it } from "vitest";
import { appleSongFromUrl, normalizeIsrc } from "../isrc";

describe("normalizeIsrc", () => {
  it("upper-cases and strips hyphens and spaces", () => {
    expect(normalizeIsrc("us-ab1-18-00123")).toBe("USAB11800123");
    expect(normalizeIsrc(" usab11800123 ")).toBe("USAB11800123");
  });

  it("rejects anything that is not 12 letters or digits", () => {
    expect(normalizeIsrc("USAB1180012")).toBeNull();
    expect(normalizeIsrc("USAB118001234")).toBeNull();
    expect(normalizeIsrc("USAB1180012!")).toBeNull();
    expect(normalizeIsrc("")).toBeNull();
    expect(normalizeIsrc(undefined)).toBeNull();
    expect(normalizeIsrc(12)).toBeNull();
  });
});

describe("appleSongFromUrl", () => {
  it("reads the song from an album link's ?i= parameter", () => {
    expect(appleSongFromUrl("https://music.apple.com/us/album/some-album/123?i=456")).toEqual({
      id: "456",
      storefront: "us",
    });
  });

  it("reads the storefront from the path", () => {
    expect(appleSongFromUrl("https://music.apple.com/GB/album/x/1?i=2")?.storefront).toBe("gb");
  });

  it("reads a /song/ link", () => {
    expect(appleSongFromUrl("https://music.apple.com/fr/song/titre/789")).toEqual({
      id: "789",
      storefront: "fr",
    });
  });

  it("defaults the storefront to us when the path has none", () => {
    expect(appleSongFromUrl("https://music.apple.com/song/titre/789")?.storefront).toBe("us");
  });

  it("reads ?i= from a link with no path at all", () => {
    expect(appleSongFromUrl("https://music.apple.com/?i=5")).toEqual({ id: "5", storefront: "us" });
  });

  it("returns null for an album link alone, other hosts, junk and empty values", () => {
    expect(appleSongFromUrl("https://music.apple.com/us/album/x/123")).toBeNull();
    expect(appleSongFromUrl("https://music.apple.com/us/album/x/123?i=abc")).toBeNull();
    expect(appleSongFromUrl("https://music.apple.com/us/song/titre")).toBeNull();
    expect(appleSongFromUrl("https://example.com/us/song/t/789")).toBeNull();
    expect(appleSongFromUrl("not a url")).toBeNull();
    expect(appleSongFromUrl("")).toBeNull();
    expect(appleSongFromUrl(null)).toBeNull();
  });
});
