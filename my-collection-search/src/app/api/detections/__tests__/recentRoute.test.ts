import { describe, it, expect, vi, beforeEach } from "vitest";

const repo = vi.hoisted(() => ({ listRecent: vi.fn() }));
vi.mock("@/server/repositories/playDetectionRepository", () => ({
  playDetectionRepository: repo,
}));

import { GET } from "../recent/route";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "d1", ingest_id: "i1", source_id: "aswitch", session_id: "s1",
    track_id: "t1", friend_id: 1, confidence: 0.94, offset_seconds: 12.4,
    window_start_at: "2026-09-21T02:00:00.000Z",
    fingerprint_type: "chromaprint", fingerprint_version: "1",
    created_at: "2026-09-21T02:00:05.000Z",
    track_title: "Power", track_artist: "Ray Barretto", track_album: "Power",
    ...overrides,
  };
}

const req = (qs = "") => new Request(`http://app/api/detections/recent?${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  repo.listRecent.mockResolvedValue([row()]);
});

describe("GET /api/detections/recent", () => {
  it("returns a matched window with its track", async () => {
    const body = await (await GET(req())).json();

    expect(body.detections[0]).toMatchObject({
      matched: true, artist: "Ray Barretto", title: "Power",
      confidence: 0.94, offset_seconds: 12.4,
    });
  });

  it("marks a no-match window as unmatched rather than omitting it", async () => {
    // The state the pipeline is in most of the time between tracks.
    repo.listRecent.mockResolvedValue([
      row({ track_id: null, friend_id: null, confidence: null,
            offset_seconds: null, track_title: null, track_artist: null,
            track_album: null }),
    ]);

    const body = await (await GET(req())).json();

    expect(body.detections[0]).toMatchObject({
      matched: false, track_id: null, artist: null, confidence: null,
    });
  });

  it("passes the filters through", async () => {
    await GET(req("source_id=aswitch&session_id=s1&since=2026-09-21T00:00:00Z"));

    expect(repo.listRecent).toHaveBeenCalledWith(
      expect.objectContaining({
        source_id: "aswitch", session_id: "s1",
        since: "2026-09-21T00:00:00Z",
      })
    );
  });

  it.each([
    ["matched=true", true],
    ["matched=false", false],
    ["", undefined],
  ])("maps %o to the matched filter", async (qs, expected) => {
    await GET(req(qs));
    expect(repo.listRecent.mock.calls[0][0].matched).toBe(expected);
  });

  it("caps the page size", async () => {
    await GET(req("limit=99999"));
    expect(repo.listRecent.mock.calls[0][0].limit).toBe(500);
  });

  it("falls back to sane paging for junk", async () => {
    await GET(req("limit=abc&offset=xyz"));
    expect(repo.listRecent.mock.calls[0][0]).toMatchObject({ limit: 50, offset: 0 });
  });

  it("clamps a negative offset", async () => {
    await GET(req("offset=-5"));
    expect(repo.listRecent.mock.calls[0][0].offset).toBe(0);
  });

  it("normalises timestamps to ISO", async () => {
    repo.listRecent.mockResolvedValue([
      row({ window_start_at: new Date("2026-09-21T02:00:00Z") }),
    ]);
    const body = await (await GET(req())).json();
    expect(body.detections[0].window_start_at).toBe("2026-09-21T02:00:00.000Z");
  });

  it("tolerates a window with no start time", async () => {
    repo.listRecent.mockResolvedValue([row({ window_start_at: null })]);
    const body = await (await GET(req())).json();
    expect(body.detections[0].window_start_at).toBeNull();
  });

  it("500s a query failure", async () => {
    repo.listRecent.mockRejectedValue(new Error("connection reset"));
    expect((await GET(req())).status).toBe(500);
  });

  it("500s a rejection that is not an Error", async () => {
    repo.listRecent.mockRejectedValue("boom");
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("boom");
  });

  it("falls back to a generic message when the error has none", async () => {
    repo.listRecent.mockRejectedValue(new Error(""));
    expect((await (await GET(req())).json()).error).toBe("Failed to list detections");
  });
});
