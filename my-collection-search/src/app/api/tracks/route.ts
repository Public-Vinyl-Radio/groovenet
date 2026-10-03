import { NextResponse } from "next/server";
import { analytics } from "@/lib/analytics/server";
import {
  trackRepository,
  type UpdateTrackInput,
} from "@/server/repositories/trackRepository";
import { computeEmbeddingUpdates } from "@/lib/trackEmbeddingDiff";
import { shouldTriggerFingerprintIndex } from "@/lib/trackFingerprintTrigger";
import { fingerprintIndexService } from "@/server/services/fingerprintIndexService";
import { embeddingQueueService } from "@/server/services/embeddingQueueService";
import type { EmbeddingJob } from "@/types/embeddingQueue";

export async function PATCH(req: Request) {
  try {
    const data = (await req.json()) as UpdateTrackInput;
    const current = await trackRepository.findTrackByTrackIdAndFriendId(
      data.track_id,
      data.friend_id
    );

    const updated = await trackRepository.updateTrackFields(data);
    if (!updated) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }

    const embeddingUpdates = computeEmbeddingUpdates(current, updated);

    // Enqueue rather than generate inline (#385): an OpenAI outage retries
    // in the background instead of silently leaving the track without an
    // embedding, and the PATCH no longer waits on an external call.
    const embeddingJobs: EmbeddingJob[] = [];
    if (embeddingUpdates.prompt) {
      embeddingJobs.push({
        track_id: updated.track_id,
        friend_id: updated.friend_id,
        kind: "prompt",
      });
    }
    if (embeddingUpdates.identity) {
      embeddingJobs.push({
        track_id: updated.track_id,
        friend_id: updated.friend_id,
        kind: "identity",
      });
    }
    if (embeddingUpdates.audioVibe) {
      embeddingJobs.push({
        track_id: updated.track_id,
        friend_id: updated.friend_id,
        kind: "audio_vibe",
      });
    }
    if (embeddingJobs.length > 0) {
      try {
        await embeddingQueueService.enqueue(embeddingJobs);
      } catch (queueError) {
        console.error("Failed to enqueue embedding jobs:", queueError);
      }
    }

    // A track that just gained reference audio is invisible to play tracking
    // until it is fingerprinted (#303) — queue it now rather than waiting for
    // someone to remember `groovenet fingerprint-library`.
    if (shouldTriggerFingerprintIndex(current, updated)) {
      try {
        await fingerprintIndexService.startRun({
          kind: "track",
          track_id: updated.track_id,
          friend_id: updated.friend_id,
        });
      } catch (fingerprintError) {
        // NoFingerprintEngineError when fingerprint-service is down is
        // expected and must not fail the PATCH — the periodic backfill pass
        // catches this track on its next tick regardless.
        console.error(
          "Failed to queue fingerprint index for track:",
          fingerprintError
        );
      }
    }

    analytics.track(
      "track_edited",
      {
        track_id: updated.track_id,
        changed_fields: Object.keys(data).filter(
          (key) => key !== "track_id" && key !== "friend_id"
        ),
        has_rating_change: "star_rating" in data,
        has_notes_change: "notes" in data,
        has_tags_change: "local_tags" in data,
      },
      { request: req }
    );

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating track:", error);
    return NextResponse.json(
      { error: "Failed to update track" },
      { status: 500 }
    );
  }
}
