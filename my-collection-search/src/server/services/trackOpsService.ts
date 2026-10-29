import fs from "fs";
import { getEssentiaAnalysisPath, readEssentiaAnalysis } from "@/lib/essentia-storage";
import {
  trackRepository,
  type CoverArtBackfillCandidateRow,
  type TrackEssentiaBackfillRow,
} from "@/server/repositories/trackRepository";
import { redisJobService } from "@/server/services/redisJobService";

type TrackQueueError = { track_id: string; error: string };
type TrackFriendQueueError = { track_id: string; friend_id: number; error: string };
type CoverArtQueueError = {
  track_id: string;
  friend_id: number;
  release_id: string | null;
  error: string;
};

export class TrackOpsService {
  async queueDurationFixForTrack(params: {
    track_id: string;
    friend_id: number;
  }): Promise<
    | { success: true; jobId: string; track_id: string; friend_id: number }
    | { success: false; code: 404 | 400; error: string }
  > {
    const track = await trackRepository.findTrackWithLocalAudio(params.track_id, params.friend_id);

    if (!track) {
      return { success: false, code: 404, error: "Track not found" };
    }
    if (!track.local_audio_url) {
      return { success: false, code: 400, error: "Track has no local_audio_url" };
    }

    const jobId = await redisJobService.createDurationJob({
      track_id: params.track_id,
      friend_id: params.friend_id,
      local_audio_url: track.local_audio_url,
    });

    return {
      success: true,
      jobId,
      track_id: params.track_id,
      friend_id: params.friend_id,
    };
  }

  async queueMissingDurationFixJobs(): Promise<{
    queued: number;
    jobIds: string[];
    errors: TrackQueueError[];
  }> {
    const rows = await trackRepository.findTracksMissingDurationWithLocalM4a();

    const jobIds: string[] = [];
    const errors: TrackQueueError[] = [];

    for (const row of rows) {
      try {
        const jobId = await redisJobService.createDurationJob({
          track_id: row.track_id,
          friend_id: row.friend_id,
          local_audio_url: row.local_audio_url,
        });
        jobIds.push(jobId);
      } catch (err) {
        errors.push({
          track_id: row.track_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { queued: jobIds.length, jobIds, errors };
  }

  async queueEssentiaBackfillJobs(params: {
    friend_id: number | null;
    force: boolean;
    limit?: number;
  }): Promise<{
    queued: number;
    skipped_existing: number;
    total_candidates: number;
    force: boolean;
    jobIds: string[];
    errors: TrackFriendQueueError[];
  }> {
    const rows = await trackRepository.findTracksForEssentiaBackfill(
      params.friend_id,
      params.limit,
    );

    const jobIds: string[] = [];
    const errors: TrackFriendQueueError[] = [];
    let skippedExisting = 0;

    for (const row of rows) {
      try {
        if (!row.local_audio_url) continue;

        if (!params.force) {
          const analysisPath = getEssentiaAnalysisPath(row.track_id, row.friend_id);
          const savedAnalysis = fs.existsSync(analysisPath)
            ? readEssentiaAnalysis(row.track_id, row.friend_id)
            : null;
          const hasPersistedMetadata = this.hasPersistedEssentiaMetadata(row);
          const hasUsableAnalysisFile = this.hasUsableSavedAnalysis(savedAnalysis?.payload);

          if (hasPersistedMetadata && hasUsableAnalysisFile) {
            skippedExisting += 1;
            continue;
          }
        }

        const jobId = await redisJobService.createAnalyzeLocalJob({
          track_id: row.track_id,
          friend_id: row.friend_id,
          local_audio_url: row.local_audio_url,
        });
        jobIds.push(jobId);
      } catch (err) {
        errors.push({
          track_id: row.track_id,
          friend_id: row.friend_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      queued: jobIds.length,
      skipped_existing: skippedExisting,
      total_candidates: rows.length,
      force: params.force,
      jobIds,
      errors,
    };
  }

  async queueCoverArtBackfillJobs(params: { friend_id: number | null }): Promise<{
    queued: number;
    queuedAlbums: number;
    tracksImpacted: number;
    jobIds: string[];
    errors: CoverArtQueueError[];
  }> {
    const rows = await trackRepository.findCoverArtBackfillCandidates(params.friend_id);

    const jobIds: string[] = [];
    const errors: CoverArtQueueError[] = [];
    let tracksImpacted = 0;

    for (const row of rows) {
      try {
        this.assertReleaseId(row);

        const jobId = await redisJobService.createCoverArtAlbumJob({
          track_id: row.track_id,
          friend_id: row.friend_id,
          release_id: row.release_id,
        });
        jobIds.push(jobId);
        tracksImpacted += Number(row.missing_tracks || 0);
      } catch (err) {
        errors.push({
          track_id: row.track_id,
          friend_id: row.friend_id,
          release_id: row.release_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      queued: jobIds.length,
      queuedAlbums: jobIds.length,
      tracksImpacted,
      jobIds,
      errors,
    };
  }

  private assertReleaseId(
    row: CoverArtBackfillCandidateRow,
  ): asserts row is CoverArtBackfillCandidateRow & { release_id: string } {
    if (!row.release_id) {
      throw new Error("Missing release_id");
    }
  }

  private hasPersistedEssentiaMetadata(row: TrackEssentiaBackfillRow): boolean {
    return (
      row.bpm != null && row.key != null && row.danceability != null && row.duration_seconds != null
    );
  }

  private hasUsableSavedAnalysis(payload: unknown): boolean {
    if (!payload || typeof payload !== "object") return false;

    const root = payload as { analysis?: unknown };
    const analysis = root.analysis;
    if (!analysis || typeof analysis !== "object") return false;

    const typedAnalysis = analysis as {
      error?: unknown;
      rhythm?: unknown;
      tonal?: unknown;
      metadata?: unknown;
      highlevel?: unknown;
    };

    if (typedAnalysis.error) return false;

    return Boolean(
      typedAnalysis.rhythm ||
      typedAnalysis.tonal ||
      typedAnalysis.metadata ||
      typedAnalysis.highlevel,
    );
  }
}

export const trackOpsService = new TrackOpsService();
