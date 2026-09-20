import { describe, it, expect, vi, beforeEach } from "vitest";

const service = vi.hoisted(() => ({ getRetentionStatus: vi.fn() }));
vi.mock("@/server/services/ingestSweeperService", () => service);

import { GET } from "../retention/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const status = {
  files: 42,
  bytes: 18350080,
  sweepable: 7,
  orphans: 1,
  inFlight: 2,
  lastSweptAt: "2026-09-20T21:40:00.000Z",
  policy: {
    maxAgeHours: 24,
    maxBytes: 2147483648,
    orphanGraceMinutes: 60,
    sweepIntervalMinutes: 15,
  },
};

describe("GET /api/audio/ingest/retention", () => {
  it("reports usage and the active policy", async () => {
    service.getRetentionStatus.mockResolvedValue(status);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(status);
  });

  it("reports a volume that has never been swept", async () => {
    service.getRetentionStatus.mockResolvedValue({ ...status, lastSweptAt: null });

    expect((await (await GET()).json()).lastSweptAt).toBeNull();
  });

  it("surfaces in-flight files, which the sweeper will not touch", async () => {
    // A volume filling with these means records are wedged, not that the
    // sweeper is broken.
    service.getRetentionStatus.mockResolvedValue({ ...status, inFlight: 500 });

    expect((await (await GET()).json()).inFlight).toBe(500);
  });

  it("returns 500 when the volume cannot be read", async () => {
    service.getRetentionStatus.mockRejectedValue(new Error("EACCES"));

    const res = await GET();

    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("EACCES");
  });
});
