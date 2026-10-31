import { NextRequest, NextResponse } from "next/server";
import { homeQuerySchema, homeResponseSchema } from "@/api-contract/schemas";
import { homeService } from "@/server/services/homeService";

export async function GET(request: NextRequest) {
  try {
    const query = homeQuerySchema.safeParse({
      friend_id: new URL(request.url).searchParams.get("friend_id"),
    });
    if (!query.success)
      return NextResponse.json(
        { error: "Invalid home query", details: query.error.flatten() },
        { status: 400 },
      );
    return NextResponse.json(homeResponseSchema.parse(await homeService.getHome(query.data)));
  } catch (error) {
    console.error("Error getting home:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get home" },
      { status: 500 },
    );
  }
}
