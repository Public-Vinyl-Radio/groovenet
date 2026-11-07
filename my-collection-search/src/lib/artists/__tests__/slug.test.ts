import { describe, expect, it } from "vitest";
import { chooseArtistSlug, slugifyArtistName } from "../slug.js";

describe("slugifyArtistName", () => {
  it.each([
    ["The Strokes", "the-strokes"],
    ["Fruko Y Sus Tesos", "fruko-y-sus-tesos"],
    ["Sigur Rós", "sigur-ros"],
    ["Björk", "bjork"],
    ["Mötley Crüe", "motley-crue"],
    ["Ænima Łódź", "aenima-lodz"],
    ["Guns N' Roses", "guns-n-roses"],
    ["Simon & Garfunkel", "simon-and-garfunkel"],
    ["Nirvana (2)", "nirvana"],
    ["  --Wu-Tang Clan!!  ", "wu-tang-clan"],
    ["!!!", ""],
    ["Ünïcödé ß þ ø đ œ", "unicode-ss-th-o-d-oe"],
  ])("%s -> %s", (name, slug) => {
    expect(slugifyArtistName(name)).toBe(slug);
  });

  it("caps length without leaving a trailing dash", () => {
    const slug = slugifyArtistName(`${"a".repeat(79)} b`);
    expect(slug).toBe("a".repeat(79));
  });
});

describe("chooseArtistSlug", () => {
  const takenBy =
    (...taken: string[]) =>
    async (s: string) =>
      taken.includes(s);

  it("uses the name when free", async () => {
    expect(await chooseArtistSlug("The Strokes", null, takenBy())).toBe("the-strokes");
  });
  it("adds the Discogs id on a collision", async () => {
    expect(await chooseArtistSlug("Nirvana", "123", takenBy("nirvana"))).toBe("nirvana-123");
  });
  it("counts up when there is no id, or the id form is taken too", async () => {
    expect(await chooseArtistSlug("Nirvana", null, takenBy("nirvana"))).toBe("nirvana-2");
    expect(
      await chooseArtistSlug("Nirvana", "123", takenBy("nirvana", "nirvana-123", "nirvana-2")),
    ).toBe("nirvana-3");
  });
  it("falls back to 'artist' for a name that slugs to nothing", async () => {
    expect(await chooseArtistSlug("!!!", null, takenBy())).toBe("artist");
    expect(await chooseArtistSlug("???", null, takenBy("artist"))).toBe("artist-2");
  });
});
