import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  recordCareQueueService,
  flattenedRecordCareQueue,
  currentCareMonth,
} from "../recordCareQueueService";
import { recordCareQueueRepository } from "@/server/repositories/recordCareQueueRepository";
import { recordCareService } from "../recordCareService";
import type { QueueRow } from "@/server/repositories/recordCareQueueRepository";
vi.mock("@/server/repositories/recordCareQueueRepository", () => ({
  recordCareQueueRepository: {
    queue: vi.fn(),
    history: vi.fn(),
    openStackCopies: vi.fn(),
    thisMonth: vi.fn(),
  },
}));
vi.mock("../recordCareService", () => ({ recordCareService: { careSummary: vi.fn() } }));
const now = new Date("2026-11-01T06:30:00Z");
const by_sleeve_type = { original: 0, paper: 2, poly: 0, "poly-rice-paper-poly": 0, unknown: 19 };
const row = (group_name: QueueRow["group_name"], copy_id: number | null): QueueRow => ({
  group_name,
  copy_id,
  release_id: String(copy_id),
  title: "Title",
  artist: "Artist",
  thumbnail: null,
  inner_sleeve_type: null,
  added_at: null,
  spin_count: 2,
  last_spin_at: "2026-10-31T00:00:00Z",
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("GROOVENET_TIME_ZONE", "America/Los_Angeles");
  vi.mocked(recordCareQueueRepository.queue).mockResolvedValue({
    items: [row("spun_recently", 1), row("new_arrivals", 2), row("backlog", null)],
    backlog_total: 15,
  });
  vi.mocked(recordCareQueueRepository.openStackCopies).mockResolvedValue([]);
  vi.mocked(recordCareQueueRepository.thisMonth).mockResolvedValue({ records: 2, sessions: 1 });
  vi.mocked(recordCareService.careSummary).mockResolvedValue({ by_sleeve_type } as never);
  vi.mocked(recordCareQueueRepository.history).mockResolvedValue({
    total: 21,
    cleaned: 10,
    recent: 10,
    cleaning_days: 1,
    first_recent: "2026-10-12T00:00:00Z",
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
it("defaults to the current display-zone calendar month at a UTC month boundary", () => {
  expect(currentCareMonth(now, "America/Los_Angeles")).toBe("2026-10");
  expect(currentCareMonth(now, "UTC")).toBe("2026-11");
});
it("shapes all groups and implicit copies, with defaults and backlog totals", async () => {
  const result = await recordCareQueueService.queue({ friend_id: 7 });
  expect(recordCareQueueRepository.queue).toHaveBeenCalledWith(
    7,
    "2026-10",
    "America/Los_Angeles",
    now,
    50,
    0,
    [],
  );
  expect(result.spun_recently.items).toEqual([{ ...row("spun_recently", 1), window_label: "OCT" }]);
  expect(result.new_arrivals).toEqual({ window_days: 30, items: [row("new_arrivals", 2)] });
  expect(result.backlog).toEqual({
    items: [row("backlog", null)],
    total: 15,
    limit: 50,
    offset: 0,
  });
});
it("passes configurable month and backlog paging without paging priority groups", async () => {
  const result = await recordCareQueueService.queue(
    { friend_id: 7, month: "2026-09", limit: 0, offset: 20 },
    now,
  );
  expect(recordCareQueueRepository.queue).toHaveBeenCalledWith(
    7,
    "2026-09",
    "America/Los_Angeles",
    now,
    0,
    20,
    [],
  );
  expect(result.spun_recently.window_label).toBe("SEP");
  expect(result.backlog).toMatchObject({ limit: 0, offset: 20 });
});
it("exports the complete stack pull order without a backlog page limit", async () => {
  expect(await flattenedRecordCareQueue(7)).toEqual([
    row("spun_recently", 1),
    row("new_arrivals", 2),
    row("backlog", null),
  ]);
  expect(recordCareQueueRepository.queue).toHaveBeenCalledWith(
    7,
    "2026-10",
    "America/Los_Angeles",
    now,
    null,
    0,
    [],
  );
});
it("passes real open-stack refs to the SQL and uses the display month for session counts", async () => {
  const excluded = [
    { copy_id: null, release_id: "a" },
    { copy_id: 2, release_id: "b" },
  ];
  vi.mocked(recordCareQueueRepository.openStackCopies).mockResolvedValue(excluded);
  await recordCareQueueService.queue({ friend_id: 7 });
  expect(recordCareQueueRepository.openStackCopies).toHaveBeenCalledWith(7);
  expect(recordCareQueueRepository.queue).toHaveBeenLastCalledWith(
    7,
    "2026-10",
    "America/Los_Angeles",
    now,
    50,
    0,
    excluded,
  );
  expect((await recordCareQueueService.progress({ friend_id: 7 })).this_month).toEqual({
    records: 2,
    sessions: 1,
  });
  expect(recordCareQueueRepository.thisMonth).toHaveBeenCalledWith(
    7,
    "2026-10",
    "America/Los_Angeles",
  );
});
it("returns ever-cleaned progress, sleeves, and no pace for one cleaning day", async () => {
  expect(await recordCareQueueService.progress({ friend_id: 7 })).toEqual({
    total: 21,
    cleaned: 10,
    stack_size: 10,
    stacks_total: 3,
    stacks_done: 1,
    next_stack_no: 2,
    pace: null,
    this_month: { records: 2, sessions: 1 },
    by_sleeve_type,
  });
});
it.each([null, "2026-10-30T00:00:00Z"])(
  "hides pace with insufficient elapsed history (%s)",
  async (first_recent) => {
    vi.mocked(recordCareQueueRepository.history).mockResolvedValue({
      total: 21,
      cleaned: 10,
      recent: 10,
      cleaning_days: 2,
      first_recent,
    });
    expect((await recordCareQueueService.progress({ friend_id: 7 }, now)).pace).toBeNull();
  },
);
it("uses four weeks of first cleanings and projects remaining copies at that rate", async () => {
  vi.mocked(recordCareQueueRepository.history).mockResolvedValue({
    total: 30,
    cleaned: 10,
    recent: 10,
    cleaning_days: 2,
    first_recent: "2026-10-12T00:00:00Z",
  });
  const result = await recordCareQueueService.progress({ friend_id: 7, stack_size: 5 });
  expect(result).toMatchObject({
    stacks_total: 6,
    stacks_done: 2,
    next_stack_no: 3,
    pace: {
      stacks_per_week: 0.5,
      projected_finish_date: new Date(now.getTime() + 56 * 86400000).toISOString(),
    },
  });
});
it.each([0, 21])(
  "completes empty or fully cleaned libraries, including the partial final stack (%i)",
  async (total) => {
    vi.mocked(recordCareQueueRepository.history).mockResolvedValue({
      total,
      cleaned: total,
      recent: 0,
      cleaning_days: 0,
      first_recent: null,
    });
    expect(await recordCareQueueService.progress({ friend_id: 7 })).toMatchObject({
      stacks_total: Math.ceil(total / 10),
      stacks_done: Math.ceil(total / 10),
      next_stack_no: null,
      pace: null,
    });
  },
);
