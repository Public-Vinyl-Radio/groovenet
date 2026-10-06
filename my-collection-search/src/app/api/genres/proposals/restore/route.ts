import { NextRequest, NextResponse } from "next/server";
import {
  genreProposalRestoreBodySchema,
  genreProposalRestoreResponseSchema,
} from "@/api-contract/schemas";
import { restoreProposals } from "@/server/services/genreReconciliationService";
import { parseBody, reconciliationError } from "@/server/genres/reconciliationRoute";

/** Undo for review: writes proposals back exactly as the snapshots say. */
export async function POST(request: NextRequest) {
  const body = await parseBody(request, genreProposalRestoreBodySchema);
  if ("response" in body) return body.response;
  try {
    return NextResponse.json(
      genreProposalRestoreResponseSchema.parse(await restoreProposals(body.data.snapshots))
    );
  } catch (error) {
    return reconciliationError(error);
  }
}
