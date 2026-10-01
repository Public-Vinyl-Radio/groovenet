import { NextRequest, NextResponse } from "next/server";
import {
  recordCareSummaryQuerySchema,
  recordCareSummaryResponseSchema,
} from "@/api-contract/schemas";
import { recordCareService } from "@/server/services/recordCareService";
import { errorMessage } from "../../recordCareErrorStatus";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const parsedQuery = recordCareSummaryQuerySchema.safeParse({
      friend_id: url.searchParams.get("friend_id"),
      overdue_days: url.searchParams.get("overdue_days") ?? undefined,
      needs_sleeve: url.searchParams.get("needs_sleeve") ?? undefined,
    });
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "Invalid record care query", details: parsedQuery.error.flatten() },
        { status: 400 }
      );
    }

    const { friend_id, ...options } = parsedQuery.data;
    const summary = await recordCareService.careSummary(friend_id, options);
    return NextResponse.json(recordCareSummaryResponseSchema.parse(summary));
  } catch (error) {
    console.error("Error summarising record care:", error);
    return NextResponse.json(
      { error: errorMessage(error, "Failed to summarise record care") },
      { status: 500 }
    );
  }
}
