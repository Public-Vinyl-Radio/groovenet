import { NextRequest, NextResponse } from "next/server";
import {
  genreReconciliationCoverageQuerySchema,
  genreReconciliationCoverageSchema,
} from "@/api-contract/schemas";
import { getCoverage } from "@/server/services/genreReconciliationService";
import { reconciliationError } from "@/server/genres/reconciliationRoute";

/**
 * How much of the local_tags backlog is reconciled, and the exact-match share,
 * for one friend's tracks or everyone's.
 */
export async function GET(request: NextRequest) {
  const query = genreReconciliationCoverageQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries())
  );
  if (!query.success) {
    return NextResponse.json(
      { error: "Invalid coverage query", details: query.error.flatten() },
      { status: 400 }
    );
  }
  try {
    return NextResponse.json(
      genreReconciliationCoverageSchema.parse(await getCoverage(query.data.friend_id ?? null))
    );
  } catch (error) {
    return reconciliationError(error);
  }
}
