import { beforeEach, describe, expect, it, vi } from "vitest";

const httpMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/http", () => ({
  http: httpMock,
}));

import {
  getIngestPipelineStats,
  getIngestRetentionStatus,
  listRecentDetections,
  listRecentIngests,
} from "./vinylPipeline";

const GET_NO_STORE = { method: "GET", cache: "no-store" };

/** The URL the most recent http call used. */
function calledUrl(): string {
  return httpMock.mock.calls[0][0] as string;
}

/** Query params of the most recent http call. */
function calledParams(): URLSearchParams {
  return new URLSearchParams(calledUrl().split("?")[1] ?? "");
}

beforeEach(() => {
  httpMock.mockReset();
  httpMock.mockResolvedValue({});
});

describe("listRecentIngests", () => {
  it("hits the recent-ingests route with no-store", async () => {
    await listRecentIngests();
    expect(calledUrl().split("?")[0]).toBe("/api/audio/ingest/recent");
    expect(httpMock.mock.calls[0][1]).toEqual(GET_NO_STORE);
  });

  it("forwards every filter", async () => {
    await listRecentIngests({
      source_id: "living-room-vinyl",
      session_id: "sess-1",
      status: "failed",
      limit: 25,
      offset: 10,
    });

    const params = calledParams();
    expect(params.get("source_id")).toBe("living-room-vinyl");
    expect(params.get("session_id")).toBe("sess-1");
    expect(params.get("status")).toBe("failed");
    expect(params.get("limit")).toBe("25");
    expect(params.get("offset")).toBe("10");
  });

  it("omits unset filters rather than sending empty params", async () => {
    await listRecentIngests();
    const params = calledParams();
    expect(params.has("source_id")).toBe(false);
    expect(params.has("status")).toBe(false);
  });

  it("returns whatever the route responds with", async () => {
    const response = { ingests: [{ ingest_id: "i1" }], count: 1 };
    httpMock.mockResolvedValue(response);
    await expect(listRecentIngests()).resolves.toBe(response);
  });
});

describe("getIngestPipelineStats", () => {
  it("hits the stats route", async () => {
    await getIngestPipelineStats();
    expect(calledUrl().split("?")[0]).toBe("/api/audio/ingest/stats");
  });

  it("forwards minutes and source", async () => {
    await getIngestPipelineStats({ minutes: 15, source_id: "aswitch" });
    const params = calledParams();
    expect(params.get("minutes")).toBe("15");
    expect(params.get("source_id")).toBe("aswitch");
  });

  it("omits minutes when unset, so the route's own default (60) applies", async () => {
    await getIngestPipelineStats();
    expect(calledParams().has("minutes")).toBe(false);
  });
});

describe("listRecentDetections", () => {
  it("hits the detections route", async () => {
    await listRecentDetections();
    expect(calledUrl().split("?")[0]).toBe("/api/detections/recent");
  });

  it("forwards every filter, including a false matched flag", async () => {
    await listRecentDetections({
      source_id: "aswitch",
      session_id: "s1",
      matched: false,
      since: "2026-09-21T00:00:00Z",
      limit: 30,
      offset: 0,
    });

    const params = calledParams();
    expect(params.get("source_id")).toBe("aswitch");
    expect(params.get("session_id")).toBe("s1");
    // `matched: false` must still be sent — it is not the same as "unset".
    expect(params.get("matched")).toBe("false");
    expect(params.get("since")).toBe("2026-09-21T00:00:00Z");
    expect(params.get("limit")).toBe("30");
    expect(params.get("offset")).toBe("0");
  });

  it("omits matched entirely when both kinds should come back", async () => {
    await listRecentDetections({ source_id: "aswitch" });
    expect(calledParams().has("matched")).toBe(false);
  });
});

describe("getIngestRetentionStatus", () => {
  it("hits the retention route with no params", async () => {
    await getIngestRetentionStatus();
    expect(httpMock).toHaveBeenCalledWith("/api/audio/ingest/retention", GET_NO_STORE);
  });

  it("returns whatever the route responds with", async () => {
    const response = { files: 3, bytes: 900, sweepable: 1, orphans: 0, inFlight: 1,
                        lastSweptAt: null, policy: {} };
    httpMock.mockResolvedValue(response);
    await expect(getIngestRetentionStatus()).resolves.toBe(response);
  });
});
