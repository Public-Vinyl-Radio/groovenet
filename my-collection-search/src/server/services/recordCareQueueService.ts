import type {
  RecordCareQueueQuery,
  RecordCareQueueResponse,
  RecordCareProgressQuery,
  RecordCareProgressResponse,
  RecordCareQueueItem,
} from "@groovenet/contracts";
import { getDisplayTimeZone } from "@/server/config/timeZone";
import { HOME_NEW_ARRIVALS_WINDOW_DAYS } from "@/server/repositories/homeRepository";
import { recordCareQueueRepository } from "@/server/repositories/recordCareQueueRepository";
import { recordCareService } from "./recordCareService";

export function currentCareMonth(now: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
}
async function queueData(query: RecordCareQueueQuery, now: Date, all: boolean) {
  const zone = getDisplayTimeZone();
  const month = query.month ?? currentCareMonth(now, zone);
  const data = await recordCareQueueRepository.queue(
    query.friend_id,
    month,
    zone,
    now,
    all ? null : (query.limit ?? 50),
    all ? 0 : (query.offset ?? 0),
    await recordCareQueueRepository.openStackCopies(query.friend_id),
  );
  return { ...data, month };
}
/** Full queue, with no backlog pagination: the single pull-next-stack order for #941. */
export async function flattenedRecordCareQueue(
  friendId: number,
  now = new Date(),
): Promise<RecordCareQueueItem[]> {
  return (await queueData({ friend_id: friendId }, now, true)).items;
}
export const recordCareQueueService = {
  async queue(query: RecordCareQueueQuery, now = new Date()): Promise<RecordCareQueueResponse> {
    const { items, backlog_total, month } = await queueData(query, now, false);
    const window_label = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" })
      .format(new Date(`${month}-01T00:00:00Z`))
      .toUpperCase();
    return {
      spun_recently: {
        month,
        window_label,
        items: items
          .filter((r) => r.group_name === "spun_recently")
          .map((r) => ({ ...r, last_spin_at: r.last_spin_at!, window_label })),
      },
      new_arrivals: {
        window_days: HOME_NEW_ARRIVALS_WINDOW_DAYS,
        items: items.filter((r) => r.group_name === "new_arrivals"),
      },
      backlog: {
        items: items.filter((r) => r.group_name === "backlog"),
        total: backlog_total,
        limit: query.limit ?? 50,
        offset: query.offset ?? 0,
      },
    };
  },
  async progress(
    query: RecordCareProgressQuery,
    now = new Date(),
  ): Promise<RecordCareProgressResponse> {
    const zone = getDisplayTimeZone();
    const [history, summary, this_month] = await Promise.all([
      recordCareQueueRepository.history(query.friend_id, now, getDisplayTimeZone()),
      recordCareService.careSummary(query.friend_id),
      recordCareQueueRepository.thisMonth(query.friend_id, currentCareMonth(now, zone), zone),
    ]);
    const stack_size = query.stack_size ?? 10;
    const { total, cleaned, recent, cleaning_days, first_recent } = history;
    const stacks_total = Math.ceil(total / stack_size);
    const stacks_done = cleaned === total ? stacks_total : Math.floor(cleaned / stack_size);
    const enough =
      cleaning_days >= 2 &&
      first_recent !== null &&
      now.getTime() - new Date(first_recent).getTime() >= 7 * 86400000;
    const stacks_per_week = recent / stack_size / 4;
    return {
      total,
      cleaned,
      stack_size,
      stacks_total,
      stacks_done,
      next_stack_no: cleaned === total ? null : stacks_done + 1,
      pace: enough
        ? {
            stacks_per_week,
            projected_finish_date: new Date(
              now.getTime() + ((total - cleaned) / recent) * 28 * 86400000,
            ).toISOString(),
          }
        : null,
      this_month,
      by_sleeve_type: summary.by_sleeve_type,
    };
  },
};
