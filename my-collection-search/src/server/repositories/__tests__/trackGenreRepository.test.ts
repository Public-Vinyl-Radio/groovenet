import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasVectorsSelectSql,
  normalizeDescriptors,
  trackGenresSelectSql,
  trackGenreIdsSelectSql,
  TrackGenreRepository,
} from "../trackGenreRepository";

const { dbQuery, clientQuery } = vi.hoisted(() => ({
  dbQuery: vi.fn(),
  clientQuery: vi.fn(),
}));
vi.mock("@/lib/serverDb", () => ({
  dbQuery,
  withDbTransaction: (fn: (client: { query: typeof clientQuery }) => unknown) =>
    fn({ query: clientQuery }),
}));

const CUMBIA = "2b7c1f3e-8f4a-4d6b-9c1e-0a1b2c3d4e5f";
const SALSA = "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b";

describe("trackGenresSelectSql", () => {
  it("correlates on the given tracks alias and never yields null", () => {
    const sql = trackGenresSelectSql("tr");
    expect(sql).toContain("tg.track_id = tr.track_id AND tg.friend_id = tr.friend_id");
    expect(sql).toContain("'[]'::json) AS track_genres");
  });

  it("defaults to the conventional t alias", () => {
    expect(trackGenresSelectSql()).toContain("= t.track_id");
  });
});

describe("trackGenreIdsSelectSql", () => {
  it("correlates on the given tracks alias and never yields null", () => {
    const sql = trackGenreIdsSelectSql("tr");
    expect(sql).toContain("tg.track_id = tr.track_id AND tg.friend_id = tr.friend_id");
    expect(sql).toContain("'[]'::json) AS track_genre_ids");
  });

  it("defaults to the conventional t alias", () => {
    expect(trackGenreIdsSelectSql()).toContain("= t.track_id");
  });

  it("resolves the alias's styles through genre_normalize, not raw strings", () => {
    const sql = trackGenreIdsSelectSql("tr");
    expect(sql).toContain("unnest(COALESCE(tr.styles, '{}'::text[]))");
    expect(sql).toContain("genre_normalize(d.name)");
  });

  it("returns each genre's id with its immediate parent id, for hierarchy-aware overlap", () => {
    const sql = trackGenreIdsSelectSql();
    expect(sql).toContain("jsonb_build_object('id', g.id, 'parent_id', g.parent_id)");
  });
});

describe("hasVectorsSelectSql", () => {
  it("correlates on the given alias and checks the audio_vibe embedding", () => {
    const sql = hasVectorsSelectSql("agg");
    expect(sql).toContain("te.track_id = agg.track_id");
    expect(sql).toContain("te.friend_id = agg.friend_id");
    expect(sql).toContain("embedding_type = 'audio_vibe'");
    expect(sql).toContain('AS "hasVectors"');
  });

  it("defaults to the conventional t alias", () => {
    expect(hasVectorsSelectSql()).toContain("te.track_id = t.track_id");
  });
});

describe("normalizeDescriptors", () => {
  it("folds spelling, drops blanks and de-duplicates in first-seen order", () => {
    expect(normalizeDescriptors(["Uplifting", " uplifting ", "", "Late‑Night", "late-night"])).toEqual([
      "uplifting",
      "late-night",
    ]);
  });
});

describe("TrackGenreRepository.resolveGenreRefs", () => {
  beforeEach(() => vi.resetAllMocks());

  it("does not query for an empty list", async () => {
    await expect(new TrackGenreRepository().resolveGenreRefs([])).resolves.toEqual({ ids: [], unknown: [] });
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("prefers a canonical name over an alias with the same spelling", async () => {
    dbQuery.mockResolvedValue({
      rows: [
        { ref: "bossanova", genre_id: SALSA, is_alias: false },
        { ref: "bossanova", genre_id: CUMBIA, is_alias: true },
      ],
    });
    await expect(new TrackGenreRepository().resolveGenreRefs(["Bossanova"])).resolves.toEqual({
      ids: [SALSA],
      unknown: [],
    });
  });

  it("resolves ids, names and aliases, de-duplicates and reports the unknown as sent", async () => {
    dbQuery.mockResolvedValue({
      rows: [
        { ref: CUMBIA, genre_id: CUMBIA, is_alias: false },
        { ref: "psychedelic cumbia", genre_id: CUMBIA, is_alias: false },
        { ref: "salsa dura", genre_id: SALSA, is_alias: true },
      ],
    });

    const result = await new TrackGenreRepository().resolveGenreRefs([
      CUMBIA.toUpperCase(),
      "Psychedelic  Cumbia",
      "Salsa Dura",
      "Feminist Anthem",
    ]);

    expect(result).toEqual({ ids: [CUMBIA, SALSA], unknown: ["Feminist Anthem"] });
    expect(dbQuery).toHaveBeenCalledWith(expect.stringContaining("FROM genre_aliases"), [
      [CUMBIA],
      ["psychedelic cumbia", "salsa dura", "feminist anthem"],
    ]);
  });
});

describe("TrackGenreRepository.replaceTrackGenres", () => {
  beforeEach(() => vi.resetAllMocks());

  it("removes links not kept and inserts the rest without relabelling existing ones", async () => {
    await new TrackGenreRepository().replaceTrackGenres("t1", 1, [CUMBIA], "manual");

    expect(clientQuery).toHaveBeenNthCalledWith(1, expect.stringContaining("DELETE FROM track_genres"), [
      "t1",
      1,
      [CUMBIA],
    ]);
    expect(clientQuery).toHaveBeenNthCalledWith(2, expect.stringContaining("ON CONFLICT DO NOTHING"), [
      "t1",
      1,
      [CUMBIA],
      "manual",
    ]);
  });

  it("clears every link when given none", async () => {
    await new TrackGenreRepository().replaceTrackGenres("t1", 1, [], "manual");
    expect(clientQuery).toHaveBeenCalledTimes(1);
  });
});

describe("TrackGenreRepository.listReleaseGenreCounts", () => {
  beforeEach(() => vi.resetAllMocks());

  it("counts the release's other live tracks' genres, most used first", async () => {
    const counts = [{ name: "Cumbia", track_count: 3 }];
    dbQuery.mockResolvedValue({ rows: counts });

    await expect(
      new TrackGenreRepository().listReleaseGenreCounts("r1", 6, "t1")
    ).resolves.toEqual(counts);

    const [sql, params] = dbQuery.mock.calls[0];
    expect(sql).toContain("t.track_id <> $3");
    expect(sql).toContain("t.deleted_at IS NULL");
    expect(sql).toContain("ORDER BY track_count DESC");
    expect(params).toEqual(["r1", 6, "t1", 5]);
  });
});
