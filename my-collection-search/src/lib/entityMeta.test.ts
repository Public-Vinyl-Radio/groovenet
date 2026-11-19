import { describe, expect, it } from "vitest";
import { albumMeta } from "@/lib/entityMeta";

describe("albumMeta", () => {
  it("joins the identifier, track count and runtime", () => {
    expect(albumMeta({ identifier: "LP-322", trackCount: 11, totalSeconds: 3823 })).toBe(
      "LP-322 · 11 tracks · 1:03:43",
    );
  });

  it("uses the singular and leaves out what is unknown", () => {
    expect(albumMeta({ trackCount: 1, totalSeconds: 0 })).toBe("1 track");
    expect(albumMeta({ identifier: "LP-1", trackCount: 0, totalSeconds: 0 })).toBe("LP-1");
    expect(albumMeta({ trackCount: 0, totalSeconds: 0 })).toBeUndefined();
  });
});
