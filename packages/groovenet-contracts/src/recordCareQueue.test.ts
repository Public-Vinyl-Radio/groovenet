import { expect, it } from "vitest";
import {
  recordCareQueueQuerySchema,
  recordCareProgressQuerySchema,
  recordCareQueueResponseSchema,
  recordCareProgressResponseSchema,
  recordCareQueueJsonSchemas,
} from "./recordCareQueue.js";
it("describes configurable month, backlog paging and stack size with valid bounds", () => {
  expect(recordCareQueueQuerySchema.parse({ friend_id: 1 })).toEqual({ friend_id: 1 });
  expect(
    recordCareQueueQuerySchema.parse({ friend_id: 1, month: "2026-10", limit: 0, offset: 5 }),
  ).toMatchObject({ month: "2026-10", limit: 0, offset: 5 });
  for (const invalid of [
    { friend_id: 0 },
    { friend_id: 1, month: "2026-13" },
    { friend_id: 1, limit: 501 },
    { friend_id: 1, offset: -1 },
  ])
    expect(recordCareQueueQuerySchema.safeParse(invalid).success).toBe(false);
  expect(recordCareProgressQuerySchema.parse({ friend_id: 1, stack_size: 10 })).toEqual({
    friend_id: 1,
    stack_size: 10,
  });
  expect(recordCareProgressQuerySchema.safeParse({ friend_id: 1, stack_size: 0 }).success).toBe(
    false,
  );
});
it("documents implicit copies, group metadata and nullable progress integrations", () => {
  const item = {
    copy_id: null,
    release_id: "r",
    title: "Record",
    artist: "Artist",
    thumbnail: null,
    inner_sleeve_type: null,
    added_at: "2026-10-01T00:00:00Z",
  };
  const queue = {
    spun_recently: {
      month: "2026-10",
      window_label: "OCT",
      items: [
        { ...item, spin_count: 3, last_spin_at: "2026-10-02T00:00:00Z", window_label: "OCT" },
      ],
    },
    new_arrivals: { window_days: 30, items: [item] },
    backlog: { items: [], total: 14, limit: 50, offset: 0 },
  };
  expect(recordCareQueueResponseSchema.parse(queue)).toEqual(queue);
  const progress = {
    cleaned: 1,
    total: 14,
    stack_size: 10,
    stacks_total: 2,
    stacks_done: 0,
    next_stack_no: 1,
    pace: null,
    this_month: null,
    by_sleeve_type: { original: 0, paper: 0, poly: 0, "poly-rice-paper-poly": 0, unknown: 14 },
  };
  expect(recordCareProgressResponseSchema.parse(progress)).toEqual(progress);
  expect(
    recordCareProgressResponseSchema.parse({
      ...progress,
      next_stack_no: null,
      pace: { stacks_per_week: 2, projected_finish_date: "2026-12-01T00:00:00Z" },
      this_month: { records: 10, sessions: 1 },
    }).this_month,
  ).toEqual({ records: 10, sessions: 1 });
  expect(Object.keys(recordCareQueueJsonSchemas)).toEqual([
    "RecordCareQueueResponse",
    "RecordCareProgressResponse",
  ]);
});
