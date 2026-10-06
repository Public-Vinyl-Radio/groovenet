import { NextResponse } from "next/server";
import { genreReconciliationCoverageSchema } from "@/api-contract/schemas";
import { getCoverage } from "@/server/services/genreReconciliationService";
import { reconciliationError } from "@/server/genres/reconciliationRoute";

/** How much of the local_tags backlog is reconciled, and the exact-match share. */
export async function GET() {
  try {
    return NextResponse.json(genreReconciliationCoverageSchema.parse(await getCoverage()));
  } catch (error) {
    return reconciliationError(error);
  }
}
