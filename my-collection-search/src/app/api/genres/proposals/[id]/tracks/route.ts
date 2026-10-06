import { NextRequest, NextResponse } from "next/server";
import {
  genreProposalTracksQuerySchema,
  genreProposalTracksResponseSchema,
} from "@/api-contract/schemas";
import { getProposalTracks } from "@/server/services/genreReconciliationService";
import { parseId, reconciliationError } from "@/server/genres/reconciliationRoute";

/** A few tracks tagged with the proposal's value, shown while reviewing it. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await parseId(context.params);
  if ("response" in params) return params.response;
  const query = genreProposalTracksQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries())
  );
  if (!query.success) {
    return NextResponse.json(
      { error: "Invalid track query", details: query.error.flatten() },
      { status: 400 }
    );
  }
  try {
    const tracks = await getProposalTracks(params.id, query.data.friend_id ?? null, query.data.limit ?? 3);
    return NextResponse.json(genreProposalTracksResponseSchema.parse({ tracks }));
  } catch (error) {
    return reconciliationError(error);
  }
}
