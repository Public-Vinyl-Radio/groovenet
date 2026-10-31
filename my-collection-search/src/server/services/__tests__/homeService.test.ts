import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { emptyHome } from "@/test/homeFixture";
import { homeService } from "../homeService";
import { homeRepository } from "@/server/repositories/homeRepository";
import { recordCopyRepository } from "@/server/repositories/recordCopyRepository";
import { redisJobService } from "../redisJobService";
import { DEFAULT_TARGET_SLEEVE, defaultOverdueDays } from "@/lib/recordCare";
vi.mock("@/server/repositories/homeRepository", () => ({
  homeRepository: { counts: vi.fn(), arrivals: vi.fn(), attention: vi.fn(), playlists: vi.fn() },
}));
vi.mock("@/server/repositories/recordCopyRepository", () => ({
  recordCopyRepository: { careCounts: vi.fn() },
}));
vi.mock("../redisJobService", () => ({ redisJobService: { getAllJobs: vi.fn() } }));
const now = new Date("2026-10-31T12:00:00Z");
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.mocked(homeRepository.counts).mockResolvedValue(emptyHome.counts);
  vi.mocked(homeRepository.arrivals).mockResolvedValue({ unrated_count: 0, items: [] });
  vi.mocked(homeRepository.attention).mockResolvedValue({
    missing_audio: 0,
    missing_bpm_or_key: 0,
  });
  vi.mocked(homeRepository.playlists).mockResolvedValue(emptyHome.playlists);
  vi.mocked(recordCopyRepository.careCounts).mockResolvedValue({
    total: 0,
    never_cleaned: 0,
    overdue: 0,
    needs_sleeve: 0,
  });
  vi.mocked(redisJobService.getAllJobs).mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());
it("returns an empty library and uses the chores overdue rule", async () => {
  expect(await homeService.getHome({ friend_id: 7 })).toEqual(emptyHome);
  expect(recordCopyRepository.careCounts).toHaveBeenCalledWith(
    7,
    defaultOverdueDays(),
    DEFAULT_TARGET_SLEEVE,
  );
  expect(homeRepository.arrivals).toHaveBeenCalledWith(7, now);
});
it("shapes dates, keeps all-window unrated counts and draft durations", async () => {
  const arrival = {
    release_id: "a",
    title: "A",
    artist: "B",
    thumbnail: null,
    date_added: now,
    play_count: 2,
    album_rating: null,
  };
  vi.mocked(homeRepository.arrivals).mockResolvedValue({
    unrated_count: 8,
    items: Array(5).fill(arrival),
  });
  const draft = {
    id: 4,
    playlist_id: 3,
    title: null,
    location_name: "Club",
    track_count: 2,
    duration_seconds: 120,
    duration_known_share: 0.5,
  };
  vi.mocked(homeRepository.playlists).mockResolvedValue({
    draft_set: draft,
    recent: [
      {
        id: 3,
        name: "P",
        created_at: now,
        track_count: 2,
        duration_seconds: 120,
        duration_known_share: 0.5,
      },
    ],
  });
  vi.mocked(homeRepository.counts).mockResolvedValue({ tracks: 10, albums: 8, playlists: 1 });
  vi.mocked(homeRepository.attention).mockResolvedValue({
    missing_audio: 2,
    missing_bpm_or_key: 3,
  });
  vi.mocked(recordCopyRepository.careCounts).mockResolvedValue({
    total: 8,
    never_cleaned: 2,
    overdue: 4,
    needs_sleeve: 1,
  });
  const result = await homeService.getHome({ friend_id: 7 });
  expect(result.counts).toEqual({ tracks: 10, albums: 8, playlists: 1 });
  expect(result.new_arrivals).toEqual({
    window_days: 30,
    unrated_count: 8,
    items: Array(5).fill({ ...arrival, date_added: now.toISOString() }),
  });
  expect(result.attention).toEqual({
    missing_audio: 2,
    missing_bpm_or_key: 3,
    due_for_cleaning: 4,
    failed_jobs: 0,
  });
  expect(result.playlists.draft_set).toEqual(draft);
  expect(result.playlists.recent[0].created_at).toBe(now.toISOString());
});
it("counts failed jobs for this friend in the inclusive seven-day window", async () => {
  const start = now.getTime() - 7 * 86400000;
  const jobs = [
    { friend_id: 7, status: "failed", updated_at: start },
    { friend_id: 7, status: "failed", updated_at: start - 1 },
    { friend_id: 7, status: "failed", updated_at: now.getTime() },
    { friend_id: 7, status: "failed", updated_at: now.getTime() + 1 },
    { friend_id: 8, status: "failed", updated_at: start },
    { friend_id: 7, status: "completed", updated_at: start },
  ];
  vi.mocked(redisJobService.getAllJobs).mockResolvedValue(jobs as never);
  expect((await homeService.getHome({ friend_id: 7 })).attention.failed_jobs).toBe(2);
});
it("logs a Redis failure and returns a nullable count", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const error = new Error("Redis unavailable");
  vi.mocked(redisJobService.getAllJobs).mockRejectedValue(error);
  expect((await homeService.getHome({ friend_id: 7 })).attention.failed_jobs).toBeNull();
  expect(log).toHaveBeenCalledWith("Error getting Home failed jobs:", error);
  log.mockRestore();
});
it("propagates a database failure", async () => {
  vi.mocked(homeRepository.counts).mockRejectedValue(new Error("db down"));
  await expect(homeService.getHome({ friend_id: 7 })).rejects.toThrow("db down");
});
