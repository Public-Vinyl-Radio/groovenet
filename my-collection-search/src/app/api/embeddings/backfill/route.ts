import { NextResponse } from "next/server";
import { embeddingsBackfillBodySchema } from "@/api-contract/schemas";
import { embeddingsRepository } from "@/server/repositories/embeddingsRepository";
import { embeddingQueueService } from "@/server/services/embeddingQueueService";
import type { EmbeddingJob, EmbeddingJobKind } from "@/types/embeddingQueue";

const ALL_TYPES: EmbeddingJobKind[] = ["identity", "audio_vibe", "prompt"];

async function resolveCandidates(
  body: ReturnType<typeof embeddingsBackfillBodySchema.parse>
): Promise<Record<EmbeddingJobKind, EmbeddingJob[]>> {
  const types = body.types ?? ALL_TYPES;
  // `all` always re-embeds; `release`/`track` only do when `force` says so —
  // same orthogonal split as the fingerprint index body.
  const force = body.scope === "all" || body.force === true;

  const byType = await Promise.all(
    types.map((type) =>
      embeddingsRepository.listTracksForBackfill({
        type,
        friend_id: body.friend_id,
        release_id: body.scope === "release" ? body.release_id : undefined,
        track_ids: body.scope === "track" ? body.track_ids : undefined,
        force,
        limit: body.limit,
      })
    )
  );

  const result = {} as Record<EmbeddingJobKind, EmbeddingJob[]>;
  types.forEach((type, i) => {
    result[type] = byType[i].map((t) => ({ ...t, kind: type, force }));
  });
  return result;
}

/**
 * Start a trackable embeddings backfill run (#388), the piece missing after
 * #385 moved generation onto a queue: there was still no way to *ask* for
 * missing embeddings short of editing a track field to trigger a PATCH.
 *
 * Always enqueues — never generates inline — so a backfill gets the same
 * retry/backoff/pause protection as any other embedding job, at the cost of
 * never completing synchronously even for a single release. Progress is
 * read back from `/api/embeddings/backfill/{runId}`.
 */
export async function POST(req: Request) {
  try {
    let raw: unknown = {};
    try {
      raw = await req.json();
    } catch {
      // No body at all is valid — every field has a sensible default.
    }

    const parsed = embeddingsBackfillBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid backfill request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const candidatesByType = await resolveCandidates(parsed.data);

    if (parsed.data.dry_run) {
      const by_type = {
        identity: candidatesByType.identity?.length ?? 0,
        audio_vibe: candidatesByType.audio_vibe?.length ?? 0,
        prompt: candidatesByType.prompt?.length ?? 0,
      };
      return NextResponse.json({
        dry_run: true as const,
        total: by_type.identity + by_type.audio_vibe + by_type.prompt,
        by_type,
      });
    }

    const jobs = Object.values(candidatesByType).flat();
    const run = await embeddingQueueService.startBackfillRun(jobs);

    return NextResponse.json(run, { status: 202 });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error starting embeddings backfill run:", err);
    return NextResponse.json(
      { error: err.message || "Failed to start backfill run" },
      { status: 500 }
    );
  }
}
