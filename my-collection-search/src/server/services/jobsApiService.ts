import { redisJobService, type JobStatus } from "@/server/services/redisJobService";
import {
  jobRepository,
  type JobTrackPair,
  type JobTrackRow,
} from "@/server/repositories/jobRepository";
import type { JobInfo } from "@/types/jobs";

export type JobsStateFilter = "all" | "waiting" | "active" | "completed" | "failed";

export type ListJobsParams = {
  limit: number;
  offset: number;
  state: JobsStateFilter;
};

export type ListJobsResult = {
  jobs: JobInfo[];
  summary: {
    total: number;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
  pagination: {
    limit: number;
    offset: number;
    total_filtered: number;
    has_more: boolean;
  };
};

function mapJobState(status: JobStatus["status"]): JobInfo["state"] {
  if (status === "queued") return "waiting";
  if (status === "processing") return "active";
  return status;
}

function filterByState(job: JobStatus, state: JobsStateFilter): boolean {
  if (state === "all") return true;
  if (state === "waiting") return job.status === "queued";
  if (state === "active") return job.status === "processing";
  if (state === "completed") return job.status === "completed";
  if (state === "failed") return job.status === "failed";
  return true;
}

function toPair(job: JobStatus): JobTrackPair | null {
  if (!job.track_id || !Number.isFinite(job.friend_id)) return null;
  return {
    trackId: job.track_id,
    friendId: job.friend_id,
  };
}

function makeTrackMap(rows: JobTrackRow[]): Map<string, JobTrackRow> {
  const map = new Map<string, JobTrackRow>();
  for (const row of rows) {
    map.set(`${row.track_id}:${row.friend_id}`, row);
  }
  return map;
}

export class JobsApiService {
  async clearAllJobs(): Promise<void> {
    await redisJobService.clearAllJobs();
  }

  async listJobs(params: ListJobsParams): Promise<ListJobsResult> {
    const allJobs = await redisJobService.getAllJobs();

    const summary = {
      total: allJobs.length,
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
    };

    for (const job of allJobs) {
      if (job.status === "queued") summary.waiting += 1;
      else if (job.status === "processing") summary.active += 1;
      else if (job.status === "completed") summary.completed += 1;
      else if (job.status === "failed") summary.failed += 1;
    }

    const filteredJobs = allJobs.filter((job) => filterByState(job, params.state));
    const jobsPage = filteredJobs.slice(params.offset, params.offset + params.limit);

    const uniquePairs = Array.from(
      new Map(
        jobsPage
          .map((job) => toPair(job))
          .filter((pair): pair is JobTrackPair => pair !== null)
          .map((pair) => [`${pair.trackId}:${pair.friendId}`, pair]),
      ).values(),
    );

    const tracks = await jobRepository.findTracksByTrackAndFriendPairs(uniquePairs);
    const trackMap = makeTrackMap(tracks);

    const jobs: JobInfo[] = jobsPage.map((job) => {
      const safeFriendId = Number.isFinite(job.friend_id) ? job.friend_id : 0;
      const track = trackMap.get(`${job.track_id}:${job.friend_id}`);

      return {
        id: job.job_id,
        name: job.name || job.job_type || "download-audio",
        state: mapJobState(job.status),
        progress: job.progress,
        data: {
          track_id: job.track_id,
          friend_id: safeFriendId,
          release_id:
            track?.release_id || (typeof job.release_id === "string" ? job.release_id : undefined),
          job_type: job.job_type || job.name,
          title:
            typeof job.result?.title === "string" ? job.result.title : track?.title || job.track_id,
          artist:
            typeof job.result?.artist === "string" ? job.result.artist : track?.artist || undefined,
          album: track?.album || undefined,
          year: track?.year || undefined,
          album_thumbnail: track?.album_thumbnail || undefined,
          discogs_url: track?.discogs_url || undefined,
          apple_music_url: track?.apple_music_url || undefined,
          youtube_url: track?.youtube_url || undefined,
          soundcloud_url: track?.soundcloud_url || undefined,
          local_audio_url: track?.local_audio_url || undefined,
          library_identifier: track?.library_identifier || undefined,
          username: track?.username || undefined,
          downloader:
            typeof job.result?.downloader === "string" ? job.result.downloader : undefined,
          source_url_key:
            typeof job.result?.source_url_key === "string" ? job.result.source_url_key : undefined,
        },
        returnvalue: job.result,
        finishedOn:
          job.status === "completed" || job.status === "failed" ? job.updated_at : undefined,
        failedReason: job.error,
        attemptsMade: 1,
        processedOn:
          job.status === "processing" || job.status === "completed" || job.status === "failed"
            ? job.started_at || job.created_at
            : undefined,
        queue: "download",
      };
    });

    return {
      jobs,
      summary,
      pagination: {
        limit: params.limit,
        offset: params.offset,
        total_filtered: filteredJobs.length,
        has_more: params.offset + jobs.length < filteredJobs.length,
      },
    };
  }
}

export const jobsApiService = new JobsApiService();
