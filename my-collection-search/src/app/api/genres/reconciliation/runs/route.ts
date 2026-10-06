import { NextRequest, NextResponse } from "next/server";
import {
  genreReconciliationRunBodySchema,
  genreReconciliationRunSchema,
} from "@/api-contract/schemas";
import { startRun } from "@/server/services/genreReconciliationService";
import { parseBody, reconciliationError } from "@/server/genres/reconciliationRoute";

/**
 * Starts a local_tags reconciliation run (#372). Returns as soon as the run
 * exists; the work happens in the background, so poll
 * GET /api/genres/reconciliation/runs/{id}.
 */
export async function POST(request: NextRequest) {
  const body = await parseBody(request, genreReconciliationRunBodySchema);
  if ("response" in body) return body.response;
  try {
    const run = await startRun(body.data);
    return NextResponse.json(genreReconciliationRunSchema.parse(run), { status: 202 });
  } catch (error) {
    return reconciliationError(error);
  }
}
