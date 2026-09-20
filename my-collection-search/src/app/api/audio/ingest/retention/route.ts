import { NextResponse } from "next/server";
import { ingestRetentionStatusSchema } from "@/api-contract/schemas";
import { getRetentionStatus } from "@/server/services/ingestSweeperService";

/**
 * What the ingest volume is holding and what the next sweep would take (#269).
 *
 * Read-only on purpose. The sweeper runs on its own schedule, and the thing an
 * operator actually needs is to see why a volume is filling up — usually a pile
 * of `inFlight` files, which means records are wedged and the reaper (#276) is
 * not doing its job, rather than the sweeper failing at its own.
 */
export async function GET() {
  try {
    const status = await getRetentionStatus();
    return NextResponse.json(ingestRetentionStatusSchema.parse(status));
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error reading ingest retention status:", err);
    return NextResponse.json(
      { error: err.message || "Failed to read retention status" },
      { status: 500 }
    );
  }
}
