import { getRedisConnection } from "@/lib/redis";
import { v4 as uuidv4 } from "uuid";
import { settingsRepository } from "@/server/repositories/settingsRepository";

export interface DownloadJobData {
  job_id: string;
  track_id: string;
  friend_id: number;
  release_id?: string | null;
  job_type?:
    | "download"
    | "fix-duration"
    | "extract-cover-art"
    | "extract-cover-art-album"
    | "analyze-local";
  apple_music_url?: string;
  youtube_url?: string;
  soundcloud_url?: string;
  title?: string | null;
  artist?: string | null;
  preferred_downloader?: "freyr" | "spotdl" | "yt-dlp" | "scdl";
  local_audio_url?: string | null;
  // Gamdl-specific settings
  quality?: "best" | "high" | "standard" | "lossless";
  format?: "m4a" | "mp3" | "aac" | "flac";
  save_cover?: boolean;
  cover_format?: "jpg" | "png" | "raw";
  save_lyrics?: boolean;
  lyrics_format?: "lrc" | "srt" | "ttml";
  overwrite_existing?: boolean;
  skip_music_videos?: boolean;
  max_retries?: number;
}

export interface JobStatus {
  job_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  created_at: number;
  started_at?: number;
  updated_at: number;
  name?: string;
  job_type?: DownloadJobData["job_type"];
  track_id: string;
  friend_id: number;
  release_id?: string | null;
  error?: string;
  /**
   * Set when a non-fatal analysis step failed on an otherwise successful job
   * (the download completed, but Essentia/track-update did not). Lets the UI
   * flag a completed job as "analysis failed".
   */
  analysis_error?: string;
  result?: {
    file_path?: string;
    file_url?: string;
    duration?: number;
    format?: string;
    analysis_status?: "ok" | "failed";
    analysis_error?: string;
    [key: string]: unknown;
  };
}

export interface JobSummary {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
}

export class RedisJobService {
  private redis = getRedisConnection();
  private readonly updatedIndexKey = "jobs:updated";
  private readonly activeJobTtlSeconds = parseInt(
    process.env.JOB_TTL_ACTIVE_SECONDS || "604800",
    10
  );

  private async listJobKeys(): Promise<string[]> {
    const keys: string[] = [];
    let cursor = "0";
    do {
      const [nextCursor, batch] = await this.redis.scan(
        cursor,
        "MATCH",
        "job:*",
        "COUNT",
        1000
      );
      cursor = nextCursor;
      if (batch.length > 0) {
        keys.push(...batch.filter((key) => !key.endsWith(":logs")));
      }
    } while (cursor !== "0");
    return keys;
  }

  private parseJobHash(jobData: Record<string, string>): JobStatus | null {
    if (!jobData || Object.keys(jobData).length === 0) return null;
    return {
      job_id: jobData.job_id,
      status: jobData.status as JobStatus["status"],
      progress: parseInt(jobData.progress || "0"),
      created_at: parseInt(jobData.created_at),
      started_at: jobData.started_at ? parseInt(jobData.started_at) : undefined,
      updated_at: parseInt(jobData.updated_at),
      name: jobData.name,
      job_type: jobData.job_type as DownloadJobData["job_type"] | undefined,
      track_id: jobData.track_id,
      friend_id: parseInt(jobData.friend_id),
      release_id: jobData.release_id || null,
      error: jobData.error,
      analysis_error: jobData.analysis_error,
      result: jobData.result ? JSON.parse(jobData.result) : undefined,
    };
  }

  private async persistJobMetadata(
    job_id: string,
    payload: Record<string, string | number>
  ): Promise<void> {
    const pipeline = this.redis.pipeline();
    // Ensure each queued job starts with a clean per-job log buffer.
    pipeline.del(`job:${job_id}:logs`);
    pipeline.hset(`job:${job_id}`, payload);
    pipeline.zadd(this.updatedIndexKey, Date.now(), job_id);
    pipeline.expire(`job:${job_id}`, this.activeJobTtlSeconds);
    await pipeline.exec();
  }

  /**
   * Fetch gamdl settings for a friend, creating defaults if not exists
   */
  private async getGamdlSettings(friendId: number): Promise<
    Pick<
      DownloadJobData,
      | "quality"
      | "format"
      | "save_cover"
      | "cover_format"
      | "save_lyrics"
      | "lyrics_format"
      | "overwrite_existing"
      | "skip_music_videos"
      | "max_retries"
    >
  > {
    try {
      await settingsRepository.ensureGamdlSettings(friendId);
      const settings = await settingsRepository.findGamdlSettingsByFriendId(
        friendId
      );
      if (!settings) return {};

      return {
        quality: settings.audio_quality,
        format: settings.audio_format,
        save_cover: settings.save_cover,
        cover_format: settings.cover_format,
        save_lyrics: settings.save_lyrics,
        lyrics_format: settings.lyrics_format,
        overwrite_existing: settings.overwrite_existing,
        skip_music_videos: settings.skip_music_videos,
        max_retries: settings.max_retries,
      };
    } catch (error) {
      console.error(`Failed to fetch gamdl settings for friend ${friendId}:`, error);
      // Return defaults if database fails
      return {
        quality: "best",
        format: "m4a",
        save_cover: false,
        cover_format: "jpg",
        save_lyrics: false,
        lyrics_format: "lrc",
        overwrite_existing: false,
        skip_music_videos: true,
        max_retries: 3,
      };
    }
  }

  async createDownloadJob(
    data: Omit<DownloadJobData, "job_id">
  ): Promise<string> {
    const job_id = uuidv4();

    // Fetch gamdl settings for the friend if not already provided
    const gamdlSettings = data.friend_id ? await this.getGamdlSettings(data.friend_id) : {};

    // Merge provided data with fetched settings (provided data takes precedence)
    const jobData: DownloadJobData = {
      ...gamdlSettings,
      ...data,
      job_type: "download",
      job_id,
    };

    const now = Date.now();

    // Store job metadata
    await this.persistJobMetadata(job_id, {
      job_id,
      status: "queued",
      progress: 0,
      created_at: now,
      updated_at: now,
      track_id: data.track_id,
      friend_id: data.friend_id,
      name: "download-audio",
      job_type: "download",
      release_id: data.release_id || "",
    });

    // Add job to simple Redis queue (will be picked up by Python worker)
    await this.redis.lpush("download_queue", JSON.stringify(jobData));

    console.log(`Created download job ${job_id} for track ${data.track_id}`);
    return job_id;
  }

  async createDurationJob(data: {
    track_id: string;
    friend_id: number;
    local_audio_url?: string | null;
  }): Promise<string> {
    const job_id = uuidv4();
    const now = Date.now();

    await this.persistJobMetadata(job_id, {
      job_id,
      status: "queued",
      progress: 0,
      created_at: now,
      updated_at: now,
      track_id: data.track_id,
      friend_id: data.friend_id,
      name: "fix-duration",
      job_type: "fix-duration",
    });

    const jobData: DownloadJobData = {
      job_id,
      job_type: "fix-duration",
      track_id: data.track_id,
      friend_id: data.friend_id,
      ...(data.local_audio_url ? { local_audio_url: data.local_audio_url } : {}),
    };

    await this.redis.lpush("download_queue", JSON.stringify(jobData));
    console.log(`Created duration job ${job_id} for track ${data.track_id}`);
    return job_id;
  }

  async createCoverArtJob(data: {
    track_id: string;
    friend_id: number;
    local_audio_url?: string | null;
  }): Promise<string> {
    const job_id = uuidv4();
    const now = Date.now();

    await this.persistJobMetadata(job_id, {
      job_id,
      status: "queued",
      progress: 0,
      created_at: now,
      updated_at: now,
      track_id: data.track_id,
      friend_id: data.friend_id,
      name: "extract-cover-art",
      job_type: "extract-cover-art",
    });

    const jobData: DownloadJobData = {
      job_id,
      job_type: "extract-cover-art",
      track_id: data.track_id,
      friend_id: data.friend_id,
      ...(data.local_audio_url ? { local_audio_url: data.local_audio_url } : {}),
    };

    await this.redis.lpush("download_queue", JSON.stringify(jobData));
    console.log(`Created cover-art job ${job_id} for track ${data.track_id}`);
    return job_id;
  }

  async createCoverArtAlbumJob(data: {
    track_id: string;
    friend_id: number;
    release_id: string;
  }): Promise<string> {
    const job_id = uuidv4();
    const now = Date.now();

    await this.persistJobMetadata(job_id, {
      job_id,
      status: "queued",
      progress: 0,
      created_at: now,
      updated_at: now,
      track_id: data.track_id,
      friend_id: data.friend_id,
      release_id: data.release_id,
      name: "extract-cover-art-album",
      job_type: "extract-cover-art-album",
    });

    const jobData: DownloadJobData = {
      job_id,
      job_type: "extract-cover-art-album",
      track_id: data.track_id,
      friend_id: data.friend_id,
      release_id: data.release_id,
    };

    await this.redis.lpush("download_queue", JSON.stringify(jobData));
    console.log(
      `Created album cover-art job ${job_id} for release ${data.release_id}`
    );
    return job_id;
  }

  async createAnalyzeLocalJob(data: {
    track_id: string;
    friend_id: number;
    local_audio_url?: string | null;
  }): Promise<string> {
    const job_id = uuidv4();
    const now = Date.now();

    await this.persistJobMetadata(job_id, {
      job_id,
      status: "queued",
      progress: 0,
      created_at: now,
      updated_at: now,
      track_id: data.track_id,
      friend_id: data.friend_id,
      name: "analyze-local-audio",
      job_type: "analyze-local",
    });

    const jobData: DownloadJobData = {
      job_id,
      job_type: "analyze-local",
      track_id: data.track_id,
      friend_id: data.friend_id,
      ...(data.local_audio_url ? { local_audio_url: data.local_audio_url } : {}),
    };

    await this.redis.lpush("download_queue", JSON.stringify(jobData));
    console.log(`Created analyze-local job ${job_id} for track ${data.track_id}`);
    return job_id;
  }

  async getJobStatus(job_id: string): Promise<JobStatus | null> {
    const jobData = await this.redis.hgetall(`job:${job_id}`);
    return this.parseJobHash(jobData);
  }

  /**
   * Claim the right to report a job's outcome. True only the first time, so a
   * worker that retries its callback is not counted twice.
   */
  async markOutcomeReported(job_id: string): Promise<boolean> {
    return (await this.redis.hsetnx(`job:${job_id}`, "outcome_reported", "1")) === 1;
  }

  async getAllJobs(limit?: number): Promise<JobStatus[]> {
    const keys = await this.listJobKeys();
    const jobs: JobStatus[] = [];

    if (keys.length === 0) return jobs;

    const pipeline = this.redis.pipeline();
    for (const key of keys) {
      pipeline.hgetall(key);
    }

    const results = await pipeline.exec();
    if (!results) return jobs;

    for (const [err, value] of results) {
      if (err) continue;
      const parsed = this.parseJobHash(value as Record<string, string>);
      if (parsed) jobs.push(parsed);
    }

    // Sort by updated_at desc
    const sorted = jobs.sort((a, b) => b.updated_at - a.updated_at);
    return typeof limit === "number" ? sorted.slice(0, limit) : sorted;
  }

  async getJobsUpdatedSince(
    sinceTimestampMs: number,
    limit = 200
  ): Promise<JobStatus[]> {
    const end = Date.now();
    const jobIds = await this.redis.zrangebyscore(
      this.updatedIndexKey,
      sinceTimestampMs,
      end,
      "LIMIT",
      0,
      Math.max(limit, 1)
    );

    if (jobIds.length === 0) return [];

    const pipeline = this.redis.pipeline();
    for (const jobId of jobIds) {
      pipeline.hgetall(`job:${jobId}`);
    }
    const results = await pipeline.exec();
    if (!results) return [];

    const jobs: JobStatus[] = [];
    const staleJobIds: string[] = [];
    for (let i = 0; i < results.length; i += 1) {
      const [err, value] = results[i];
      if (err) continue;
      const parsed = this.parseJobHash(value as Record<string, string>);
      if (parsed) {
        jobs.push(parsed);
      } else {
        const staleJobId = jobIds[i];
        if (staleJobId) staleJobIds.push(staleJobId);
      }
    }

    if (staleJobIds.length > 0) {
      await this.redis.zrem(this.updatedIndexKey, ...staleJobIds);
    }
    return jobs.sort((a, b) => a.updated_at - b.updated_at);
  }

  async getJobSummary(): Promise<JobSummary> {
    const jobs = await this.getAllJobs();

    const summary: JobSummary = {
      total: jobs.length,
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };

    for (const job of jobs) {
      switch (job.status) {
        case "queued":
          summary.queued++;
          break;
        case "processing":
          summary.processing++;
          break;
        case "completed":
          summary.completed++;
          break;
        case "failed":
          summary.failed++;
          break;
      }
    }

    return summary;
  }

  async clearAllJobs(): Promise<void> {
    // Clear job hashes and their per-job log lists.
    const jobKeys = await this.listJobKeys();
    if (jobKeys.length > 0) {
      const logKeys = jobKeys.map((key) => `${key}:logs`);
      await this.redis.del(...jobKeys, ...logKeys);
    }

    // Clear queues
    await this.redis.del("download_queue", this.updatedIndexKey);

    console.log(`Cleared ${jobKeys.length} jobs and queues`);
  }

  async deleteJob(job_id: string): Promise<boolean> {
    const pipeline = this.redis.pipeline();
    pipeline.del(`job:${job_id}`);
    pipeline.del(`job:${job_id}:logs`);
    pipeline.zrem(this.updatedIndexKey, job_id);
    const results = await pipeline.exec();
    const deleted = Number(results?.[0]?.[1] ?? 0);
    return deleted > 0;
  }

  async getJobLogs(job_id: string): Promise<string[]> {
    const logs = await this.redis.lrange(`job:${job_id}:logs`, 0, -1);
    if (logs.length > 0) {
      return logs;
    }

    const job = await this.getJobStatus(job_id);
    if (!job) {
      return [];
    }

    const fallback = [
      `No buffered worker logs were captured for job ${job_id}.`,
      `Status: ${job.status} (${job.progress}%)`,
    ];

    if (job.error) {
      fallback.push(`Error: ${job.error}`);
    }

    if (job.result) {
      fallback.push(`Result: ${JSON.stringify(job.result, null, 2)}`);
    }

    return fallback;
  }
}

export const redisJobService = new RedisJobService();
