import { describe, expect, it } from "vitest";
import {
  buildTrackSearchWhere,
  lexicalMatchClause,
  parseTrackSearchParams,
} from "../trackSearchWhere";

describe("buildTrackSearchWhere", () => {
  it("binds the filter string, friend and attributes in order", () => {
    expect(
      buildTrackSearchWhere({
        filter: "friend_id = 3 AND local_audio_url IS NULL",
        friendId: 6,
        attributes: { key: "A minor" },
      })
    ).toEqual({
      where: ["friend_id = $1", "local_audio_url IS NULL", "friend_id = $2", "LOWER(t.key) = LOWER($3)"],
      params: [3, 6, "A minor"],
    });
  });

  it("is empty with nothing to filter", () => {
    expect(buildTrackSearchWhere({ attributes: {} })).toEqual({ where: [], params: [] });
  });
});

describe("lexicalMatchClause", () => {
  it("matches the words at the given parameter", () => {
    const sql = lexicalMatchClause("$4");
    expect(sql).toContain("plainto_tsquery('simple', $4)");
    expect(sql).toContain("similarity(coalesce(album, ''), $4) > 0.15");
  });
});

describe("parseTrackSearchParams", () => {
  it("keeps every repeated genre", () => {
    const parsed = parseTrackSearchParams(new URLSearchParams("q=x&genre=latin&genre=jazz"));
    expect(parsed.success && parsed.data.genre).toEqual(["latin", "jazz"]);
  });

  it("leaves genre out when none is given", () => {
    const parsed = parseTrackSearchParams(new URLSearchParams("q=x"));
    expect(parsed.success && parsed.data.genre).toBeUndefined();
  });
});
