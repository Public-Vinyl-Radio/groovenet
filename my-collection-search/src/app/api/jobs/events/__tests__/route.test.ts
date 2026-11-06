import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jobEventSchema } from "@groovenet/contracts";

const redis = vi.hoisted(() => ({ getJobsUpdatedSince: vi.fn() }));
vi.mock("@/server/services/redisJobService", () => ({ redisJobService: redis }));

import { GET } from "../route";

async function readChunks(reader: ReadableStreamDefaultReader<Uint8Array>, count: number) {
  const decoder = new TextDecoder();
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const { value } = await reader.read();
    out.push(decoder.decode(value));
  }
  return out;
}

describe("GET /api/jobs/events", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => vi.useRealTimers());

  it("streams connected, then each finished job once as a shared JobEvent", async () => {
    const abort = new AbortController();
    const finished = (job_id: string, status: string, extra = {}) => ({
      job_id,
      status,
      track_id: "t1",
      friend_id: 1,
      updated_at: Date.now() + 1,
      ...extra,
    });
    redis.getJobsUpdatedSince.mockResolvedValue([
      finished("ok", "completed", { result: { local_audio_url: "/a" } }),
      finished("bad", "failed", { error: "boom" }),
      finished("running", "processing"),
    ]);
    const res = GET(new Request("http://app/api/jobs/events", { signal: abort.signal }) as never);
    const reader = (await res).body!.getReader();
    expect((await readChunks(reader, 1))[0]).toBe("data: connected\n\n");

    await vi.advanceTimersByTimeAsync(10_000);
    const [ok, bad] = (await readChunks(reader, 2)).map((chunk) =>
      jobEventSchema.parse(JSON.parse(chunk.replace(/^data: /, ""))),
    );
    expect(ok).toMatchObject({ type: "job_completed", job_id: "ok" });
    expect(bad).toMatchObject({ type: "error", job_id: "bad", message: "boom" });

    // The same finished jobs are not announced twice.
    redis.getJobsUpdatedSince.mockResolvedValue([finished("ok", "completed")]);
    await vi.advanceTimersByTimeAsync(10_000);
    redis.getJobsUpdatedSince.mockRejectedValue(new Error("redis down"));
    await vi.advanceTimersByTimeAsync(10_000);
    const [failure] = await readChunks(reader, 1);
    expect(jobEventSchema.parse(JSON.parse(failure.replace(/^data: /, "")))).toMatchObject({
      type: "error",
      message: "Error checking job status",
    });
    abort.abort();
  });
});
