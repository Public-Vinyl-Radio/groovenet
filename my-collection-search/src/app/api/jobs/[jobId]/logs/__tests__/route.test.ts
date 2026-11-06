import { beforeEach, describe, expect, it, vi } from "vitest";
import { jobLogsResponseSchema } from "@groovenet/contracts";

const redis = vi.hoisted(() => ({ getJobLogs: vi.fn() }));
vi.mock("@/server/services/redisJobService", () => ({ redisJobService: redis }));

import { GET } from "../route";

const get = (jobId: string) =>
  GET(new Request(`http://app/api/jobs/${jobId}/logs`), { params: Promise.resolve({ jobId }) });

describe("GET /api/jobs/{jobId}/logs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the buffered log lines", async () => {
    redis.getJobLogs.mockResolvedValue(["a", "b"]);
    const body = jobLogsResponseSchema.parse(await (await get("j1")).json());
    expect(body).toEqual({ logs: ["a", "b"] });
    expect(redis.getJobLogs).toHaveBeenCalledWith("j1");
  });

  it("rejects a missing id", async () => {
    const res = await get("");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Job ID is required" });
  });

  it("reports a failure", async () => {
    redis.getJobLogs.mockRejectedValue(new Error("redis down"));
    const res = await get("j1");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "redis down" });
  });
});
