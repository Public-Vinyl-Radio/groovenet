import { NextRequest, NextResponse } from "next/server";
import {
  genreProposalListQuerySchema,
  genreProposalListResponseSchema,
} from "@/api-contract/schemas";
import { genreReconciliationRepository } from "@/server/repositories/genreReconciliationRepository";
import { reconciliationError } from "@/server/genres/reconciliationRoute";

/** Reconciliation proposals, most-used values first. */
export async function GET(request: NextRequest) {
  const query = genreProposalListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries())
  );
  if (!query.success) {
    return NextResponse.json(
      { error: "Invalid proposal query", details: query.error.flatten() },
      { status: 400 }
    );
  }
  try {
    const result = await genreReconciliationRepository.listProposals({
      ...query.data,
      limit: query.data.limit ?? 50,
      offset: query.data.offset ?? 0,
    });
    return NextResponse.json(genreProposalListResponseSchema.parse(result));
  } catch (error) {
    return reconciliationError(error);
  }
}
