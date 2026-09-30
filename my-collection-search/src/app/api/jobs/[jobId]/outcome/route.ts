import { NextResponse } from "next/server";
import { analytics } from "@/lib/analytics/server";
import {
  redisJobService,
  type JobStatus,
} from "@/server/services/redisJobService";

const DOWNLOADERS = ["gamdl", "yt-dlp"] as const;
const URL_KINDS = {
  apple_music_url: "apple_music",
  youtube_url: "youtube",
  soundcloud_url: "soundcloud",
} as const;

type Downloader = (typeof DOWNLOADERS)[number];

function durationMs(job: JobStatus): number | null {
  const started = job.started_at ?? job.created_at;
  return Number.isFinite(started) && Number.isFinite(job.updated_at)
    ? Math.max(0, job.updated_at - started)
    : null;
}

/**
 * Where `download-worker` says a download job has ended (#345), so its outcome
 * reaches analytics. The body is empty: the job's record in Redis, written by
 * the worker a moment earlier, is authoritative. Reporting twice is harmless —
 * only the first call is counted.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const job = await redisJobService.getJobStatus(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (job.status !== "completed" && job.status !== "failed") {
      return NextResponse.json(
        { error: `Job is ${job.status}, not finished` },
        { status: 409 }
      );
    }

    // A download job for a track with no remote URL is analysed in place and
    // never downloads anything; that is not a download outcome.
    const downloader = job.result?.downloader;
    const urlKey = job.result?.source_url_key;
    const downloaded =
      DOWNLOADERS.includes(downloader as Downloader) &&
      typeof urlKey === "string" &&
      urlKey in URL_KINDS;
    if (job.job_type !== "download" || (job.status === "completed" && !downloaded)) {
      return NextResponse.json({ reported: false });
    }

    if (!(await redisJobService.markOutcomeReported(jobId))) {
      return NextResponse.json({ reported: false });
    }

    if (job.status === "completed") {
      analytics.track(
        "track_download_completed",
        {
          track_id: job.track_id,
          downloader: downloader as Downloader,
          url_kind: URL_KINDS[urlKey as keyof typeof URL_KINDS],
          duration_ms: durationMs(job),
          analysis_ok: job.result?.analysis_status !== "failed",
        },
        { request }
      );
    } else {
      analytics.track(
        "track_download_failed",
        { track_id: job.track_id, duration_ms: durationMs(job) },
        { request }
      );
    }
    return NextResponse.json({ reported: true });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error reporting job outcome:", err);
    return NextResponse.json(
      { error: err.message || "Failed to report job outcome" },
      { status: 500 }
    );
  }
}
