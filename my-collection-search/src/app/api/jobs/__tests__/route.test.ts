import { beforeEach, describe, expect, it, vi } from "vitest";

const jobs = vi.hoisted(() => ({
  clearAllJobs: vi.fn(),
  listJobs: vi.fn(),
}));
vi.mock("@/server/services/jobsApiService", () => ({ jobsApiService: jobs }));

import { DELETE, GET } from "../route";

describe("/api/jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("clears every job", async () => {
    jobs.clearAllJobs.mockResolvedValue(undefined);
    const res = await DELETE();
    expect(await res.json()).toEqual({
      success: true,
      message: "All queue data cleared successfully",
    });
  });

  it("reports a failed clear", async () => {
    jobs.clearAllJobs.mockRejectedValue(new Error("redis down"));
    const res = await DELETE();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "redis down" });
  });

  it("falls back to a generic message for a non-Error clear failure", async () => {
    jobs.clearAllJobs.mockRejectedValue("");
    const res = await DELETE();
    expect(await res.json()).toEqual({ error: "Failed to clear queues" });
  });

  it("lists jobs with clamped paging and a validated state", async () => {
    jobs.listJobs.mockResolvedValue({ jobs: [], summary: {}, pagination: {} });
    await GET(new Request("http://app/api/jobs?limit=9000&offset=-4&state=FAILED"));
    expect(jobs.listJobs).toHaveBeenLastCalledWith({ limit: 500, offset: 0, state: "failed" });
    await GET(new Request("http://app/api/jobs?limit=abc&offset=zzz&state=bogus"));
    expect(jobs.listJobs).toHaveBeenLastCalledWith({ limit: 100, offset: 0, state: "all" });
    await GET(new Request("http://app/api/jobs"));
    expect(jobs.listJobs).toHaveBeenLastCalledWith({ limit: 100, offset: 0, state: "all" });
  });

  it("returns the service payload unchanged", async () => {
    const payload = { jobs: [], summary: { total: 0 }, pagination: { limit: 100 } };
    jobs.listJobs.mockResolvedValue(payload);
    const res = await GET(new Request("http://app/api/jobs"));
    expect(await res.json()).toEqual(payload);
  });

  it("reports a failed listing", async () => {
    jobs.listJobs.mockRejectedValue(new Error("boom"));
    const res = await GET(new Request("http://app/api/jobs"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
    jobs.listJobs.mockRejectedValue("");
    expect(await (await GET(new Request("http://app/api/jobs"))).json()).toEqual({
      error: "Failed to fetch jobs",
    });
  });
});
