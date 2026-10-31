import { describe, expect, it } from "vitest";
import { artistHref } from "./ArtistLink";

describe("artistHref", () => {
  it("searches albums for the artist, scoped to a collection when given one", () => {
    expect(artistHref("DJ Shadow", 7)).toBe("/albums?q=DJ%20Shadow&friend_id=7");
    expect(artistHref("Can & Co")).toBe("/albums?q=Can%20%26%20Co");
    expect(artistHref("Can", null)).toBe("/albums?q=Can");
  });
});
