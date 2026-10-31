import type { HomeQuery, HomeResponse } from "@groovenet/contracts";
import { homeRepository } from "@/server/repositories/homeRepository";
import { recordCopyRepository } from "@/server/repositories/recordCopyRepository";
import { DEFAULT_TARGET_SLEEVE, defaultOverdueDays } from "@/lib/recordCare";
import { redisJobService } from "@/server/services/redisJobService";

async function failedJobs(friendId: number, now: Date): Promise<number | null> {
  try {
    const jobs = await redisJobService.getAllJobs();
    const end = now.getTime();
    const start = end - 7 * 24 * 60 * 60 * 1000;
    return jobs.filter(
      (job) =>
        job.friend_id === friendId &&
        job.status === "failed" &&
        job.updated_at >= start &&
        job.updated_at <= end,
    ).length;
  } catch (error) {
    console.error("Error getting Home failed jobs:", error);
    return null;
  }
}

export const homeService = {
  async getHome({ friend_id }: HomeQuery): Promise<HomeResponse> {
    const now = new Date();
    const [counts, arrivals, attention, playlists, care, failed_jobs] = await Promise.all([
      homeRepository.counts(friend_id),
      homeRepository.arrivals(friend_id, now),
      homeRepository.attention(friend_id),
      homeRepository.playlists(friend_id),
      recordCopyRepository.careCounts(friend_id, defaultOverdueDays(), DEFAULT_TARGET_SLEEVE),
      failedJobs(friend_id, now),
    ]);
    return {
      counts,
      new_arrivals: {
        window_days: 30,
        unrated_count: arrivals.unrated_count,
        items: arrivals.items.map((item) => ({
          ...item,
          date_added: new Date(item.date_added).toISOString(),
        })),
      },
      attention: { ...attention, due_for_cleaning: care.overdue, failed_jobs },
      playlists: {
        draft_set: playlists.draft_set,
        recent: playlists.recent.map((item) => ({
          ...item,
          created_at: new Date(item.created_at).toISOString(),
        })),
      },
    };
  },
};
