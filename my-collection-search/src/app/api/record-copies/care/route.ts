import { NextRequest, NextResponse } from "next/server";
import { recordCareQuerySchema, recordCareResponseSchema } from "@/api-contract/schemas";
import { recordCareService } from "@/server/services/recordCareService";
import { errorMessage } from "../recordCareErrorStatus";

/**
 * Copies by care state: never cleaned, overdue for cleaning, or not yet in the
 * wanted sleeve. Albums with no copy rows appear as their implicit default
 * copy, `copy_id: null`.
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const parsedQuery = recordCareQuerySchema.safeParse({
      friend_id: url.searchParams.get("friend_id"),
      status: url.searchParams.get("status") ?? undefined,
      overdue_days: url.searchParams.get("overdue_days") ?? undefined,
      needs_sleeve: url.searchParams.get("needs_sleeve") ?? undefined,
      sleeve_type: url.searchParams.get("sleeve_type") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "Invalid record care query", details: parsedQuery.error.flatten() },
        { status: 400 }
      );
    }

    const result = await recordCareService.listCare(parsedQuery.data);
    return NextResponse.json(
      recordCareResponseSchema.parse({
        ...result,
        limit: parsedQuery.data.limit,
        offset: parsedQuery.data.offset,
      })
    );
  } catch (error) {
    console.error("Error listing record care:", error);
    return NextResponse.json(
      { error: errorMessage(error, "Failed to list record care") },
      { status: 500 }
    );
  }
}
