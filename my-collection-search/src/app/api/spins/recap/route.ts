import { NextRequest, NextResponse } from "next/server";
import { spinRecapQuerySchema, spinRecapResponseSchema } from "@/api-contract/schemas";
import { spinRecapService } from "@/server/services/spinRecapService";

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const query = spinRecapQuerySchema.safeParse({
      friend_id: params.get("friend_id"),
      month: params.get("month"),
    });
    if (!query.success) {
      return NextResponse.json(
        { error: "Invalid spin recap query", details: query.error.flatten() },
        { status: 400 },
      );
    }
    return NextResponse.json(
      spinRecapResponseSchema.parse(await spinRecapService.getRecap(query.data)),
    );
  } catch (error) {
    console.error("Error getting spin recap:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get spin recap" },
      { status: 500 },
    );
  }
}
