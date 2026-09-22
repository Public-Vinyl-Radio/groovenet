import { NextResponse } from "next/server";
import {
  spinAggregateBodySchema,
  spinAggregateResponseSchema,
} from "@/api-contract/schemas";
import { playDetectionRepository } from "@/server/repositories/playDetectionRepository";
import { playAggregationService } from "@/server/services/playAggregationService";

/**
 * Manually aggregate detections into spin sessions, from an explicit date (#304).
 *
 * Both automatic triggers — the immediate one in `ingestLifecycleService` and
 * the periodic backstop in `playAggregationService` — are bounded by
 * `PLAY_AGGREGATION_LOOKBACK_MINUTES` (default 60), so a backlog of
 * detections older than that is never picked up on its own. This is the
 * manual escape hatch for exactly that: run once, over whatever a listener
 * has quietly been storing.
 *
 * Idempotent, same as the automatic triggers: `aggregateSource`'s own dedup
 * (`findAutomaticSessionByDetectionId`) means re-running this over the same
 * window creates nothing twice.
 */
export async function POST(req: Request) {
  try {
    const parsed = spinAggregateBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid aggregate request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { since, source_id } = parsed.data;
    const sourceIds = source_id
      ? [source_id]
      : await playDetectionRepository.listActiveSourceIds(since);

    let created = 0;
    let skipped = 0;
    const sources = [];
    for (const id of sourceIds) {
      const result = await playAggregationService.aggregateSource(id, since);
      sources.push({ source_id: id, ...result });
      created += result.created;
      skipped += result.skipped;
    }

    return NextResponse.json(
      spinAggregateResponseSchema.parse({ since, created, skipped, sources })
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error aggregating detections into spins:", err);
    return NextResponse.json(
      { error: err.message || "Failed to aggregate detections" },
      { status: 500 }
    );
  }
}
