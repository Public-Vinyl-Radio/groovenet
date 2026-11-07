import { describe, expect, it } from "vitest";
import ArtistsLayout, { metadata } from "./layout";

describe("ArtistsLayout", () => {
  it("titles the section and renders its children", () => {
    expect(metadata.title).toBe("Artists");
    expect(ArtistsLayout({ children: "x" })).toBe("x");
  });
});
