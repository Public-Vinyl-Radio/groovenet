import { describe, expect, it } from "vitest";
import { attributeFilterClauses, missingFilterClause, parseTrackFilterSpec } from "../trackFilterSpec";

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

describe("attributeFilterClauses", () => {
  const binder = () => {
    const values: unknown[] = [];
    const bind = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    return { values, bind };
  };

  it("emits nothing for no filters", () => {
    const { values, bind } = binder();
    expect(attributeFilterClauses({}, bind)).toEqual([]);
    expect(values).toEqual([]);
  });

  it("binds each set filter in order, qualified by the alias", () => {
    const { values, bind } = binder();
    expect(
      attributeFilterClauses({ bpmMin: 120, bpmMax: 126, key: "A minor", minStarRating: 4 }, bind, "t")
    ).toEqual([
      "t.bpm >= $1",
      "t.bpm <= $2",
      "LOWER(t.key) = LOWER($3)",
      "t.star_rating >= $4",
    ]);
    expect(values).toEqual([120, 126, "A minor", 4]);
  });

  it("keeps a zero, which is a real bound", () => {
    const { values, bind } = binder();
    expect(attributeFilterClauses({ minStarRating: 0 }, bind)).toEqual(["star_rating >= $1"]);
    expect(values).toEqual([0]);
  });
});
