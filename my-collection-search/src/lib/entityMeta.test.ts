import { describe, expect, it } from "vitest";
import { albumMeta, trackMeta } from "@/lib/entityMeta";
import type { Track } from "@/types/track";

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

describe("trackMeta", () => {
  const track = (overrides: Partial<Track>) => ({ title: "Song", ...overrides }) as Track;

  it("joins the identifier, duration, BPM and Camelot key", () => {
    expect(
      trackMeta(
        track({
          library_identifier: "LP-322",
          duration_seconds: 252,
          bpm: "124.04",
          key: "A minor",
        }),
      ),
    ).toBe("LP-322 · 4:12 · 124 BPM · 8A");
  });

  it("leaves out what the track doesn't have", () => {
    expect(trackMeta(track({ bpm: "98" }))).toBe("98 BPM");
    expect(trackMeta(track({}))).toBeUndefined();
  });
});
