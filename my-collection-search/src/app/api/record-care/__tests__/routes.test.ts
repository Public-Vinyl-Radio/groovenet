import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as queue } from "../queue/route";
import { GET as progress } from "../progress/route";
import { recordCareQueueService } from "@/server/services/recordCareQueueService";
vi.mock("@/server/services/recordCareQueueService", () => ({
  recordCareQueueService: { queue: vi.fn(), progress: vi.fn() },
}));
afterEach(() => vi.restoreAllMocks());
const queueResult = {
  spun_recently: { month: "2026-10", window_label: "OCT", items: [] },
  new_arrivals: { window_days: 30, items: [] },
  backlog: { items: [], total: 0, limit: 50, offset: 0 },
};
const progressResult = {
  total: 0,
  cleaned: 0,
  stack_size: 10,
  stacks_total: 0,
  stacks_done: 0,
  next_stack_no: null,
  pace: null,
  this_month: null,
  by_sleeve_type: { original: 0, paper: 0, poly: 0, "poly-rice-paper-poly": 0, unknown: 0 },
};
it.each(["queue", "progress"] as const)(
  "validates, coerces, returns and handles errors for %s",
  async (kind) => {
    const handler = kind === "queue" ? queue : progress;
    const fn = vi.mocked(recordCareQueueService[kind]);
    const result = kind === "queue" ? queueResult : progressResult;
    fn.mockResolvedValue(result as never);
    const query =
      kind === "queue" ? "friend_id=7&month=2026-10&limit=5&offset=10" : "friend_id=7&stack_size=5";
    const response = await handler(
      new NextRequest(`http://localhost/api/record-care/${kind}?${query}`),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(fn).toHaveBeenCalledWith(
      kind === "queue"
        ? { friend_id: 7, month: "2026-10", limit: 5, offset: 10 }
        : { friend_id: 7, stack_size: 5 },
    );
    for (const invalid of [
      "",
      "friend_id=no",
      "friend_id=0",
      kind === "queue" ? "friend_id=1&month=2026-13" : "friend_id=1&stack_size=0",
      kind === "queue" ? "friend_id=1&limit=-1" : "friend_id=1&stack_size=501",
    ]) {
      expect((await handler(new NextRequest(`http://localhost/?${invalid}`))).status).toBe(400);
    }
    vi.spyOn(console, "error").mockImplementation(() => {});
    fn.mockRejectedValueOnce(new Error("database unavailable"));
    const failed = await handler(new NextRequest("http://localhost/?friend_id=7"));
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: `Failed to get record care ${kind}` });
  },
);
