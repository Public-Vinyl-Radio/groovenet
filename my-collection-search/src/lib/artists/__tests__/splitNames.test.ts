import { describe, expect, it } from "vitest";
import { splitArtistNames } from "../splitNames";

describe("splitArtistNames", () => {
  it("assigns featured roles after featuring and preserves positions", () => {
    const rows = splitArtistNames(
      "Larry Levan Featuring Sly Dunbar, Robbie Shakespeare, Gwen Guthrie",
    );
    expect(rows.map(({ credited_as, role, position }) => [credited_as, role, position])).toEqual([
      ["Larry Levan", "primary", 0],
      ["Sly Dunbar", "featured", 1],
      ["Robbie Shakespeare", "featured", 2],
      ["Gwen Guthrie", "featured", 3],
    ]);
    expect(rows[1].sort_name).toBe("Dunbar, Sly");
  });
  it.each(["feat.", "Ft.", "With"])("recognizes %s", (separator) => {
    expect(splitArtistNames(`A ${separator} B`)[1].role).toBe("featured");
  });
  it.each([",", " & ", " / ", " x ", " vs ", " vs. "])("splits on %s", (separator) => {
    expect(splitArtistNames(`A${separator}B`).map((r) => r.credited_as)).toEqual(["A", "B"]);
  });
  it("ignores empty segments", () => {
    expect(splitArtistNames(", A").map((r) => r.name)).toEqual(["A"]);
  });
  it("preserves inverted names and ampersand band names", () => {
    expect(splitArtistNames("Strokes, The / Sly & The Family Stone").map((r) => r.name)).toEqual([
      "The Strokes",
      "Sly & The Family Stone",
    ]);
  });
});
