import { NextRequest, NextResponse } from "next/server";
import { genreReconciliationRunSchema } from "@/api-contract/schemas";
import { getRun } from "@/server/services/genreReconciliationService";
import { parseId, reconciliationError } from "@/server/genres/reconciliationRoute";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await parseId(context.params);
  if ("response" in params) return params.response;
  try {
    return NextResponse.json(genreReconciliationRunSchema.parse(await getRun(params.id)));
  } catch (error) {
    return reconciliationError(error);
  }
}
