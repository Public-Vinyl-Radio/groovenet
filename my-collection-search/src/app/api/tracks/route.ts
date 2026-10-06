import { NextResponse } from "next/server";
import { analytics } from "@/lib/analytics/server";
import {
  trackRepository,
  type UpdateTrackInput,
} from "@/server/repositories/trackRepository";
import {
  normalizeDescriptors,
  trackGenreRepository,
} from "@/server/repositories/trackGenreRepository";
import { computeEmbeddingUpdates } from "@/lib/trackEmbeddingDiff";
import { shouldTriggerFingerprintIndex } from "@/lib/trackFingerprintTrigger";
import { fingerprintIndexService } from "@/server/services/fingerprintIndexService";
import { embeddingQueueService } from "@/server/services/embeddingQueueService";
import type { EmbeddingJob } from "@/types/embeddingQueue";

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as UpdateTrackInput & {
      genres?: unknown;
      descriptors?: unknown;
    };
    const { genres, descriptors, ...fields } = body;
    const data: UpdateTrackInput = fields;

    if (descriptors !== undefined) {
      if (!isStringArray(descriptors)) {
        return NextResponse.json(
          { error: "descriptors must be an array of strings" },
          { status: 400 }
        );
      }
      data.descriptors = normalizeDescriptors(descriptors);
    }

    // Track genres are taxonomy links (#371): every entry is a genre id or a
    // name that resolves through an alias. Resolve before writing anything,
    // so an unknown name fails the whole update instead of creating a genre.
    let genreIds: string[] | undefined;
    if (genres !== undefined) {
      if (!isStringArray(genres)) {
        return NextResponse.json(
          { error: "genres must be an array of genre ids or names" },
          { status: 400 }
        );
      }
      const resolved = await trackGenreRepository.resolveGenreRefs(genres);
      if (resolved.unknown.length > 0) {
        return NextResponse.json(
          {
            error: `Unknown genre: ${resolved.unknown.join(", ")}`,
            unknown_genres: resolved.unknown,
          },
          { status: 400 }
        );
      }
      genreIds = resolved.ids;
    }

    const current = await trackRepository.findTrackByTrackIdAndFriendId(
      data.track_id,
      data.friend_id
    );

    if (genreIds !== undefined) {
      if (!current) {
        return NextResponse.json({ error: "Track not found" }, { status: 404 });
      }
      await trackGenreRepository.replaceTrackGenres(
        data.track_id,
        data.friend_id,
        genreIds,
        "manual"
      );
    }

    // Re-reads the track, so the response carries the genres just written.
    const updated = await trackRepository.updateTrackFields(data);
    if (!updated) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }

    const embeddingUpdates = computeEmbeddingUpdates(current, updated);

    // Enqueue rather than generate inline (#385): an OpenAI outage retries
    // in the background instead of silently leaving the track without an
    // embedding, and the PATCH no longer waits on an external call.
    const embeddingJobs: EmbeddingJob[] = [];
    if (embeddingUpdates.identity) {
      // The context text (#408) is built from the same inputs as identity.
      for (const kind of ["identity", "context"] as const) {
        embeddingJobs.push({ track_id: updated.track_id, friend_id: updated.friend_id, kind });
      }
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
        changed_fields: Object.keys(body).filter(
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
