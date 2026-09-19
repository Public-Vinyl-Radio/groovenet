import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockDbQuery = vi.hoisted(() => vi.fn());

vi.mock("@/lib/serverDb", () => ({ dbQuery: mockDbQuery }));

import { GET, parseTrackFilter } from "../route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function req(query = "") {
  return new NextRequest(`http://localhost/api/tracks/search${query}`);
}

// Default: data query returns no rows, count query returns 0.
function stubDb(rows: unknown[] = [], total = "0") {
  mockDbQuery
    .mockResolvedValueOnce({ rows })
    .mockResolvedValueOnce({ rows: [{ total }] });
}

beforeEach(() => {
  mockDbQuery.mockReset();
});

// ─── parseTrackFilter (pure) ────────────────────────────────────────────────

describe("parseTrackFilter", () => {
  it("returns empty clauses for an undefined filter", () => {
    expect(parseTrackFilter(undefined)).toEqual({ where: [], params: [] });
  });

  it("extracts a friend_id equality with a bound parameter", () => {
    const { where, params } = parseTrackFilter("friend_id = 7");
    expect(params).toEqual([7]);
    expect(where).toEqual(["friend_id = $1"]);
  });

  it("adds a raw clause for missing local audio", () => {
    const { where, params } = parseTrackFilter("local_audio_url IS NULL");
    expect(where).toEqual(["local_audio_url IS NULL"]);
    expect(params).toEqual([]);
  });

  it("adds a clause for missing bpm or key", () => {
    const { where } = parseTrackFilter("(bpm IS NULL OR key IS NULL)");
    expect(where).toEqual(["(bpm IS NULL OR key IS NULL)"]);
  });

  it("adds the combined no-platform-links clause", () => {
    const clause =
      "(apple_music_url IS NULL AND youtube_url IS NULL AND soundcloud_url IS NULL)";
    const { where } = parseTrackFilter(clause);
    expect(where).toContain(clause);
  });

  it("adds individual platform-url clauses", () => {
    const { where } = parseTrackFilter(
      "apple_music_url IS NULL youtube_url IS NULL soundcloud_url IS NULL"
    );
    expect(where).toEqual(
      expect.arrayContaining([
        "apple_music_url IS NULL",
        "youtube_url IS NULL",
        "soundcloud_url IS NULL",
      ])
    );
  });

  it("combines friend_id with a raw clause, keeping the param index correct", () => {
    const { where, params } = parseTrackFilter(
      "friend_id = 3 local_audio_url IS NULL"
    );
    expect(params).toEqual([3]);
    expect(where).toEqual(["friend_id = $1", "local_audio_url IS NULL"]);
  });
});

// ─── GET — validation ─────────────────────────────────────────────────────────

describe("GET /api/tracks/search — validation", () => {
  it("returns 400 for invalid query params", async () => {
    const res = await GET(req("?friend_id=abc"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid query/i);
    expect(body.details).toBeDefined();
    expect(mockDbQuery).not.toHaveBeenCalled();
  });

  it("returns 400 for a negative limit", async () => {
    const res = await GET(req("?limit=-1"));
    expect(res.status).toBe(400);
    expect(mockDbQuery).not.toHaveBeenCalled();
  });
});

// ─── GET — behavior ─────────────────────────────────────────────────────────

describe("GET /api/tracks/search — behavior", () => {
  it("returns hits and estimatedTotalHits with defaults applied", async () => {
    stubDb([{ track_id: "t1", title: "Song" }], "1");
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hits).toEqual([{ track_id: "t1", title: "Song" }]);
    expect(body.estimatedTotalHits).toBe(1);
    expect(body.limit).toBe(20);
    expect(body.offset).toBe(0);
    expect(typeof body.processingTimeMs).toBe("number");
  });

  it("strips the embedding field from returned rows", async () => {
    stubDb([{ track_id: "t1", embedding: [0.1, 0.2], hasVectors: true }], "1");
    const res = await GET(req());
    const [hit] = (await res.json()).hits;
    expect(hit.embedding).toBeUndefined();
    expect(hit.hasVectors).toBe(true);
  });

  it("issues a text-search query only when q is present", async () => {
    stubDb([], "0");
    await GET(req("?q=jazz"));
    const [sql, params] = mockDbQuery.mock.calls[0];
    expect(sql).toMatch(/plainto_tsquery/);
    // whereParams (none) + q + limit + offset
    expect(params).toEqual(["jazz", 20, 0]);
  });

  it("omits the ranking/text clause when q is empty", async () => {
    stubDb([], "0");
    await GET(req());
    const [sql, params] = mockDbQuery.mock.calls[0];
    expect(sql).not.toMatch(/plainto_tsquery/);
    expect(sql).toMatch(/ORDER BY t\.id DESC/);
    expect(params).toEqual([20, 0]);
  });

  it("appends friend_id from the query as a bound where param", async () => {
    stubDb([], "0");
    await GET(req("?friend_id=5&q=abc"));
    const [dataSql, dataParams] = mockDbQuery.mock.calls[0];
    expect(dataSql).toMatch(/friend_id = \$1/);
    // friend_id + q + limit + offset
    expect(dataParams).toEqual([5, "abc", 20, 0]);
  });

  it("passes filter-derived clauses into both data and count queries", async () => {
    stubDb([], "0");
    await GET(req("?filter=local_audio_url%20IS%20NULL"));
    const [dataSql] = mockDbQuery.mock.calls[0];
    const [countSql] = mockDbQuery.mock.calls[1];
    expect(dataSql).toMatch(/local_audio_url IS NULL/);
    expect(countSql).toMatch(/local_audio_url IS NULL/);
    expect(countSql).toMatch(/COUNT\(\*\)/);
  });

  it("always filters out soft-deleted rows", async () => {
    stubDb([], "0");
    await GET(req());
    const [dataSql] = mockDbQuery.mock.calls[0];
    expect(dataSql).toMatch(/deleted_at IS NULL/);
  });

  it("returns 500 when the database query throws", async () => {
    mockDbQuery.mockRejectedValueOnce(new Error("connection refused"));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("connection refused");
  });
});
