import { describe, expect, it } from "vitest";
import { normalizeGenreName } from "./normalization";

describe("normalizeGenreName", () => {
  it("normalizes case, whitespace, and surrounding space", () => {
    expect(normalizeGenreName("  Psychedelic   Cumbia  ")).toBe("psychedelic cumbia");
  });

  it("folds Unicode hyphens to an ASCII hyphen", () => {
    expect(normalizeGenreName("Post‑punk")).toBe("post-punk");
    expect(normalizeGenreName("Post–punk")).toBe("post-punk");
  });

  it("applies NFKC before creating the lookup key", () => {
    expect(normalizeGenreName("Ｂｏｓｓａｎｏｖａ")).toBe("bossanova");
  });
});
