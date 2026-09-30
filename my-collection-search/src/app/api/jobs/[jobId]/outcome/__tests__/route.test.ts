import { beforeEach, describe, expect, it, vi } from "vitest";

const jobs = vi.hoisted(() => ({
  getJobStatus: vi.fn(),
  markOutcomeReported: vi.fn(),
}));
vi.mock("@/server/services/redisJobService", () => ({ redisJobService: jobs }));

import { POST } from "../route";
import { setAnalyticsProvider } from "@/lib/analytics/server";
import { MemoryAnalyticsProvider } from "@/lib/analytics/providers/memory";
import type { JobStatus } from "@/server/services/redisJobService";

const analyticsEvents = new MemoryAnalyticsProvider();
setAnalyticsProvider(analyticsEvents);

function job(overrides: Partial<JobStatus> = {}): JobStatus {
  return {
    job_id: "j1",
    status: "completed",
    progress: 100,
    created_at: 1_000,
    started_at: 4_000,
    updated_at: 64_000,
    job_type: "download",
    track_id: "trk-1",
    friend_id: 1,
    result: { downloader: "gamdl", source_url_key: "apple_music_url", analysis_status: "ok" },
    ...overrides,
  };
}

const report = (jobId = "j1") =>
  POST(
    new Request(`http://app/api/jobs/${jobId}/outcome`, {
      method: "POST",
      headers: { "X-Groovenet-Client": "worker" },
    }),
    { params: Promise.resolve({ jobId }) }
  );

describe("POST /api/jobs/{jobId}/outcome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analyticsEvents.reset();
    jobs.markOutcomeReported.mockResolvedValue(true);
  });

  it("reports a completed download with its downloader, URL kind and duration", async () => {
    jobs.getJobStatus.mockResolvedValue(job());
    const res = await report();
    expect(await res.json()).toEqual({ reported: true });
    expect(analyticsEvents.events.map((e) => [e.event, e.properties])).toEqual([
      [
        "track_download_completed",
        {
          track_id: "trk-1",
          downloader: "gamdl",
          url_kind: "apple_music",
          duration_ms: 60_000,
          analysis_ok: true,
          source: "pipeline",
        },
      ],
    ]);
  });

  it("flags a download whose analysis failed", async () => {
    jobs.getJobStatus.mockResolvedValue(
      job({ result: { downloader: "yt-dlp", source_url_key: "youtube_url", analysis_status: "failed" } })
    );
    await report();
    expect(analyticsEvents.events[0].properties).toMatchObject({
      downloader: "yt-dlp",
      url_kind: "youtube",
      analysis_ok: false,
    });
  });

  it("reports a failed download, timed from creation when it never started", async () => {
    jobs.getJobStatus.mockResolvedValue(
      job({ status: "failed", started_at: undefined, result: undefined, error: "all failed" })
    );
    await report();
    expect(analyticsEvents.events.map((e) => [e.event, e.properties])).toEqual([
      ["track_download_failed", { track_id: "trk-1", duration_ms: 63_000, source: "pipeline" }],
    ]);
  });

  it("counts a job once, however often the worker reports it", async () => {
    jobs.getJobStatus.mockResolvedValue(job());
    jobs.markOutcomeReported.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await report();
    const again = await report();
    expect(await again.json()).toEqual({ reported: false });
    expect(analyticsEvents.events).toHaveLength(1);
  });

  it.each([
    ["another job type", job({ job_type: "fix-duration" })],
    ["a download job that analysed a local file", job({ result: { analysis_status: "ok" } })],
  ])("reports nothing for %s", async (_label, record) => {
    jobs.getJobStatus.mockResolvedValue(record);
    expect(await (await report()).json()).toEqual({ reported: false });
    expect(jobs.markOutcomeReported).not.toHaveBeenCalled();
    expect(analyticsEvents.events).toEqual([]);
  });

  it("answers 404 for an unknown job and 409 for one still running", async () => {
    jobs.getJobStatus.mockResolvedValueOnce(null);
    expect((await report()).status).toBe(404);
    jobs.getJobStatus.mockResolvedValueOnce(job({ status: "processing" }));
    expect((await report()).status).toBe(409);
    expect(analyticsEvents.events).toEqual([]);
  });

  it("answers 500 when Redis fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    jobs.getJobStatus.mockRejectedValue(new Error("connection reset"));
    expect((await report()).status).toBe(500);
  });
});
