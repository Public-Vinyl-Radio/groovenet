import { NextRequest, NextResponse } from "next/server";
import {
  genreProposalApplyBodySchema,
  genreProposalApplyResponseSchema,
} from "@/api-contract/schemas";
import { applyProposals } from "@/server/services/genreReconciliationService";
import { parseBody, reconciliationError } from "@/server/genres/reconciliationRoute";

/**
 * Writes accepted and edited proposals: track genre links and aliases with
 * `source = reconciliation`, and descriptors. Repeatable. `friend_id` limits
 * the links and descriptors to that friend's tracks.
 */
export async function POST(request: NextRequest) {
  const body = await parseBody(request, genreProposalApplyBodySchema);
  if ("response" in body) return body.response;
  try {
    return NextResponse.json(genreProposalApplyResponseSchema.parse(await applyProposals(body.data.ids, body.data.friend_id ?? null)));
  } catch (error) {
    return reconciliationError(error);
  }
}
