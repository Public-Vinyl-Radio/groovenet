import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockDbQuery = vi.hoisted(() => vi.fn());
const mockSemanticSearch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/serverDb", () => ({ dbQuery: mockDbQuery }));
vi.mock("@/server/services/semanticTrackSearchService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/semanticTrackSearchService")>()),
  semanticTrackSearch: mockSemanticSearch,
}));

import { GET, parseTrackFilter } from "../route";
import { QueryRateLimitError } from "@/server/services/queryEmbeddingService";

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
  mockSemanticSearch.mockReset();
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

// ─── GET — semantic and hybrid modes (#409) ─────────────────────────────────

const hit = (track_id: string, extra: Record<string, unknown> = {}) => ({
  track_id,
  friend_id: 1,
  release_id: `r-${track_id}`,
  ...extra,
});

function semanticResult(hits: unknown[], extra: Record<string, unknown> = {}) {
  return { hits, cacheHit: false, embedMs: 3, vectorMs: 4, ...extra };
}

describe("GET /api/tracks/search — semantic and hybrid", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("rejects an unknown mode", async () => {
    const res = await GET(req("?mode=vibes&q=x"));
    expect(res.status).toBe(400);
  });

  it.each(["?mode=semantic&q=x&offset=20", "?mode=hybrid&q=x&limit=51"])(
    "returns 400 for paging past the single page: %s",
    async (query) => {
      const res = await GET(req(query));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/single page/);
      expect(mockSemanticSearch).not.toHaveBeenCalled();
    }
  );

  it("ranks by meaning alone in semantic mode, honouring friend and chips", async () => {
    mockSemanticSearch.mockResolvedValue(semanticResult([hit("a"), hit("b")]));

    const res = await GET(
      req(
        "?mode=semantic&q=%20late%20night%20cumbia%20&limit=10&filter=" +
          encodeURIComponent("friend_id = 1 AND local_audio_url IS NULL")
      )
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hits.map((h: { track_id: string }) => h.track_id)).toEqual(["a", "b"]);
    expect(body).toMatchObject({ mode: "semantic", estimatedTotalHits: 2, offset: 0, limit: 10 });
    expect(body.degraded).toBeUndefined();
    expect(mockSemanticSearch).toHaveBeenCalledWith({
      q: "late night cumbia",
      limit: 10,
      friendId: 1,
      missing: ["local_audio"],
      caller: "friend:1:ip:unknown",
    });
    expect(mockDbQuery).not.toHaveBeenCalled();
    const logged = JSON.parse((console.info as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(logged).toMatchObject({ component: "track-search", mode: "semantic", query_length: 17, results: 2 });
    expect(JSON.stringify(logged)).not.toContain("cumbia");
  });

  it("rate-limits by the friend_id param and the forwarded client IP", async () => {
    mockSemanticSearch.mockResolvedValue(semanticResult([]));
    await GET(
      new NextRequest("http://localhost/api/tracks/search?mode=semantic&q=x&friend_id=3", {
        headers: { "x-forwarded-for": "10.0.0.4, 172.16.0.1" },
      })
    );
    expect(mockSemanticSearch).toHaveBeenCalledWith(
      expect.objectContaining({ friendId: 3, caller: "friend:3:ip:10.0.0.4" })
    );

    await GET(
      new NextRequest("http://localhost/api/tracks/search?mode=semantic&q=x", {
        headers: { "x-real-ip": "10.0.0.9" },
      })
    );
    expect(mockSemanticSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({ friendId: undefined, caller: "friend:all:ip:10.0.0.9" })
    );
  });

  it("returns nothing when the filter and the param name different friends", async () => {
    const res = await GET(
      req("?mode=semantic&q=x&friend_id=2&filter=" + encodeURIComponent("friend_id = 1"))
    );
    const body = await res.json();
    expect(body).toMatchObject({ hits: [], estimatedTotalHits: 0, mode: "semantic" });
    expect(mockSemanticSearch).not.toHaveBeenCalled();
  });

  it("lists lexically when the query is empty, whatever the mode", async () => {
    stubDb([{ track_id: "t1" }], "1");
    const res = await GET(req("?mode=hybrid&q=%20%20"));
    const body = await res.json();
    expect(body).toMatchObject({ mode: "lexical", estimatedTotalHits: 1 });
    expect(mockSemanticSearch).not.toHaveBeenCalled();
  });

  it("omits mode from a plain lexical response", async () => {
    stubDb([], "0");
    const body = await (await GET(req("?q=x&mode=lexical"))).json();
    expect(body.mode).toBeUndefined();
  });

  it("fuses both legs in hybrid mode, with known items first", async () => {
    stubDb([hit("lex"), hit("known", { title: "Ritmo" })], "2");
    mockSemanticSearch.mockResolvedValue(semanticResult([hit("vibe"), hit("lex")], { cacheHit: true }));

    const res = await GET(req("?mode=hybrid&q=ritmo&friend_id=1&limit=3"));

    const body = await res.json();
    expect(body.hits.map((h: { track_id: string }) => h.track_id)).toEqual(["known", "lex", "vibe"]);
    expect(body).toMatchObject({ mode: "hybrid", estimatedTotalHits: 3, limit: 3 });
    // The lexical leg asks for the full leg size at offset 0, with the friend bound.
    const [, lexParams] = mockDbQuery.mock.calls[0];
    expect(lexParams).toEqual([1, "ritmo", 50, 0]);
    expect(mockSemanticSearch).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
    const logged = JSON.parse((console.info as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(logged).toMatchObject({
      mode: "hybrid",
      degraded: false,
      cache_hit: true,
      lexical_results: 2,
      semantic_results: 2,
      results: 3,
    });
  });

  it("degrades hybrid to lexical when the semantic leg fails", async () => {
    stubDb([hit("lex")], "1");
    mockSemanticSearch.mockRejectedValue(new Error("openai down"));

    const res = await GET(req("?mode=hybrid&q=x"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ mode: "hybrid", degraded: true, estimatedTotalHits: 1 });
    expect(console.warn).toHaveBeenCalledWith("[search] hybrid fell back to lexical:", "openai down");
  });

  it("degrades hybrid on a rate limit too, rather than refusing", async () => {
    stubDb([], "0");
    mockSemanticSearch.mockRejectedValue(new QueryRateLimitError(12));
    const res = await GET(req("?mode=hybrid&q=x"));
    expect(res.status).toBe(200);
    expect((await res.json()).degraded).toBe(true);
  });

  it("returns 429 with Retry-After when semantic mode is rate-limited", async () => {
    mockSemanticSearch.mockRejectedValue(new QueryRateLimitError(12));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(req("?mode=semantic&q=x"));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("12");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("returns 500 when semantic mode fails", async () => {
    mockSemanticSearch.mockRejectedValue(new Error("openai down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(req("?mode=semantic&q=x"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("openai down");
  });
});
