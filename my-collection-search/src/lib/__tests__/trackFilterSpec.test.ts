import { describe, expect, it } from "vitest";
import { missingFilterClause, parseTrackFilterSpec } from "../trackFilterSpec";

describe("parseTrackFilterSpec", () => {
  it("is empty for no filter", () => {
    expect(parseTrackFilterSpec(undefined)).toEqual({ missing: [] });
    expect(parseTrackFilterSpec("")).toEqual({ missing: [] });
  });

  it("reads the friend and every chip, in emission order", () => {
    expect(
      parseTrackFilterSpec(
        "soundcloud_url IS NULL AND friend_id = 4 AND local_audio_url IS NULL AND (bpm IS NULL OR key IS NULL)"
      )
    ).toEqual({ friendId: 4, missing: ["local_audio", "bpm_or_key", "soundcloud_url"] });
  });

  it("treats the all-streaming chip as also matching each single-url check", () => {
    expect(
      parseTrackFilterSpec(
        "(apple_music_url IS NULL AND youtube_url IS NULL AND soundcloud_url IS NULL)"
      ).missing
    ).toEqual(["all_streaming_urls", "apple_music_url", "youtube_url", "soundcloud_url"]);
  });
});

describe("missingFilterClause", () => {
  it("leaves columns bare without an alias", () => {
    expect(missingFilterClause("local_audio")).toBe("local_audio_url IS NULL");
    expect(missingFilterClause("youtube_url")).toBe("youtube_url IS NULL");
  });

  it("qualifies every column with an alias", () => {
    expect(missingFilterClause("bpm_or_key", "t")).toBe("(t.bpm IS NULL OR t.key IS NULL)");
    expect(missingFilterClause("all_streaming_urls", "t")).toBe(
      "(t.apple_music_url IS NULL AND t.youtube_url IS NULL AND t.soundcloud_url IS NULL)"
    );
    expect(missingFilterClause("apple_music_url", "t")).toBe("t.apple_music_url IS NULL");
  });
});
