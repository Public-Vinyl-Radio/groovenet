import { describe, expect, it } from "vitest";
import {
  JOB_STATES,
  JOB_STATE_FILTERS,
  jobDetailsSchema,
  jobEventSchema,
  jobJsonSchemas,
  jobLogsResponseSchema,
  jobOutcomeResponseSchema,
  jobsClearResponseSchema,
  jobsListQuerySchema,
  jobsListResponseSchema,
} from "./jobs.js";

const job = {
  id: "j1",
  name: "download",
  state: "completed",
  progress: 100,
  data: { track_id: "t1", friend_id: 1, downloader: "gamdl", future_field: true },
  attemptsMade: 1,
  queue: "download",
};

describe("job contracts", () => {
  it("publishes the state enums", () => {
    expect(JOB_STATES).toEqual(["waiting", "active", "completed", "failed"]);
    expect(JOB_STATE_FILTERS).toEqual(["all", "waiting", "active", "completed", "failed"]);
    expect(jobsListQuerySchema.safeParse({ state: "queued" }).success).toBe(false);
    expect(jobsListQuerySchema.parse({ limit: 5, state: "all" })).toEqual({
      limit: 5,
      state: "all",
    });
  });

  it("keeps additional job and payload fields", () => {
    const parsed = jobsListResponseSchema.parse({
      jobs: [{ ...job, extra: 1 }],
      summary: { total: 1, waiting: 0, active: 0, completed: 1, failed: 0 },
      pagination: { limit: 100, offset: 0, total_filtered: 1, has_more: false },
    });
    expect(parsed.jobs[0]).toHaveProperty("extra", 1);
    expect(parsed.jobs[0].data).toHaveProperty("future_field", true);
  });

  it("parses job details with their extra fields", () => {
    const details = jobDetailsSchema.parse({ ...job, delay: 0, timestamp: 1, opts: {}, logs: [] });
    expect(details.timestamp).toBe(1);
    expect(jobDetailsSchema.safeParse({ ...job, state: "queued" }).success).toBe(false);
  });

  it("describes logs, outcomes, clears and events", () => {
    expect(jobLogsResponseSchema.parse({ logs: ["a"] })).toEqual({ logs: ["a"] });
    expect(jobOutcomeResponseSchema.parse({ reported: false })).toEqual({ reported: false });
    expect(jobsClearResponseSchema.parse({ success: true, message: "ok" }).success).toBe(true);
    expect(jobEventSchema.parse({ type: "error", message: "boom", timestamp: 1 }).type).toBe(
      "error",
    );
    expect(jobEventSchema.safeParse({ type: "done", timestamp: 1 }).success).toBe(false);
  });

  it("publishes JSON schemas with documentation", () => {
    expect(Object.keys(jobJsonSchemas)).toContain("JobEvent");
    expect(jobJsonSchemas.JobOutcomeResponse).toMatchObject({
      properties: { reported: { type: "boolean" } },
      required: ["reported"],
    });
  });
});
