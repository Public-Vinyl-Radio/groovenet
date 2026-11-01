import { NextRequest, NextResponse } from "next/server";
import {
  recordCareQueueQuerySchema,
  recordCareQueueResponseSchema,
} from "@/api-contract/recordCareQueue";
import { recordCareQueueService } from "@/server/services/recordCareQueueService";

export async function GET(request: NextRequest) {
  try {
    const query = recordCareQueueQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!query.success)
      return NextResponse.json(
        { error: "Invalid record care query", details: query.error.flatten() },
        { status: 400 },
      );
    const result = await recordCareQueueService.queue(query.data);
    return NextResponse.json(recordCareQueueResponseSchema.parse(result));
  } catch (error) {
    console.error("Error getting record care queue:", error);
    return NextResponse.json({ error: "Failed to get record care queue" }, { status: 500 });
  }
}
