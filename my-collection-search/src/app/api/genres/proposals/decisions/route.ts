import { NextRequest, NextResponse } from "next/server";
import {
  genreProposalDecisionsBodySchema,
  genreProposalDecisionsResponseSchema,
} from "@/api-contract/schemas";
import { decideProposals } from "@/server/services/genreReconciliationService";
import { parseBody, reconciliationError } from "@/server/genres/reconciliationRoute";

/**
 * Records several review decisions in one transaction (#373): accepting a
 * group of values is one request. Returns each proposal's state before, which
 * POST /api/genres/proposals/restore takes back for undo.
 */
export async function POST(request: NextRequest) {
  const body = await parseBody(request, genreProposalDecisionsBodySchema);
  if ("response" in body) return body.response;
  try {
    return NextResponse.json(
      genreProposalDecisionsResponseSchema.parse(await decideProposals(body.data.decisions))
    );
  } catch (error) {
    return reconciliationError(error);
  }
}
