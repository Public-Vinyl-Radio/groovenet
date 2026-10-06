import { describe, expect, it } from "vitest";
import {
  albumGenreFilterClause,
  attributeFilterClauses,
  missingFilterClause,
  parseTrackFilterSpec,
  trackGenreFilterClause,
} from "../trackFilterSpec";

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

describe("genre filter clauses (#375)", () => {
  const filter = { ids: ["id-latin", "id-cumbia"], keys: ["cumbia", "latin"] };
  const binder = () => {
    const values: unknown[] = [];
    return {
      values,
      bind: (value: unknown) => {
        values.push(value);
        return `$${values.length}`;
      },
    };
  };

  it("matches a track on its own genres, else on its Discogs genres and styles", () => {
    const { values, bind } = binder();
    const sql = trackGenreFilterClause(filter, bind, "t");
    expect(values).toEqual([filter.ids, filter.keys]);
    expect(sql).toContain("tg.track_id = t.track_id AND tg.friend_id = t.friend_id");
    expect(sql).toContain("tg.genre_id = ANY($1::uuid[])");
    // The Discogs fallback applies only to a track with no genre links at all.
    expect(sql).toMatch(/OR \(\s*NOT EXISTS \(SELECT 1 FROM track_genres tg/);
    expect(sql).toContain("unnest(COALESCE(t.genres, '{}') || COALESCE(t.styles, '{}'))");
    expect(sql).toContain("genre_normalize(discogs_genre.name) = ANY($2::text[])");
  });

  it("matches an album on its Discogs values or a third of its tagged live tracks", () => {
    const { values, bind } = binder();
    const sql = albumGenreFilterClause(filter, bind, "a");
    expect(values).toEqual([filter.keys, filter.ids]);
    expect(sql).toContain("unnest(COALESCE(a.genres, '{}') || COALESCE(a.styles, '{}'))");
    expect(sql).toContain("genre_normalize(discogs_genre.name) = ANY($1::text[])");
    expect(sql).toContain("gt.release_id = a.release_id");
    expect(sql).toContain("gt.deleted_at IS NULL");
    expect(sql).toContain("tg.genre_id = ANY($2::uuid[])");
    // The inner join leaves untagged tracks out of the share.
    expect(sql).toContain("JOIN track_genres tg");
    const matching =
      "count(DISTINCT gt.track_id) FILTER (WHERE tg.genre_id = ANY($2::uuid[]))";
    expect(sql).toContain(`HAVING ${matching} > 0`);
    expect(sql).toContain(`${matching} * 3 >= count(DISTINCT gt.track_id) * 1`);
  });

  it("is emitted with the other attribute filters, after them", () => {
    const { values, bind } = binder();
    const clauses = attributeFilterClauses({ bpmMin: 120, genreFilter: filter }, bind, "t");
    expect(clauses).toHaveLength(2);
    expect(clauses[0]).toBe("t.bpm >= $1");
    expect(clauses[1]).toContain("tg.genre_id = ANY($2::uuid[])");
    expect(values).toEqual([120, filter.ids, filter.keys]);
  });

  it("needs the tracks alias, since its subqueries correlate with the row", () => {
    expect(() => attributeFilterClauses({ genreFilter: filter }, () => "$1")).toThrow(
      "needs the tracks alias"
    );
  });
});
