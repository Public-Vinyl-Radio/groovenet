import { NextRequest, NextResponse } from "next/server";
import {
  genreProposalApplyBodySchema,
  genreProposalApplyResponseSchema,
} from "@/api-contract/schemas";
import { applyProposals } from "@/server/services/genreReconciliationService";
import { parseBody, reconciliationError } from "@/server/genres/reconciliationRoute";

/**
 * Writes accepted and edited proposals: track genre links and aliases with
 * `source = reconciliation`, and descriptors. Repeatable.
 */
export async function POST(request: NextRequest) {
  const body = await parseBody(request, genreProposalApplyBodySchema);
  if ("response" in body) return body.response;
  try {
    return NextResponse.json(genreProposalApplyResponseSchema.parse(await applyProposals(body.data.ids)));
  } catch (error) {
    return reconciliationError(error);
  }
}
