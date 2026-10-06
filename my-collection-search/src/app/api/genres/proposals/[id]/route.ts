import { NextRequest, NextResponse } from "next/server";
import { genreProposalSchema, genreProposalUpdateBodySchema } from "@/api-contract/schemas";
import { updateProposal } from "@/server/services/genreReconciliationService";
import { parseBody, parseId, reconciliationError } from "@/server/genres/reconciliationRoute";

/**
 * Records a review decision: accept or reject as proposed, or change the
 * action or targets, which marks it `edited`.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await parseId(context.params);
  if ("response" in params) return params.response;
  const body = await parseBody(request, genreProposalUpdateBodySchema);
  if ("response" in body) return body.response;
  try {
    return NextResponse.json(genreProposalSchema.parse(await updateProposal(params.id, body.data)));
  } catch (error) {
    return reconciliationError(error);
  }
}
