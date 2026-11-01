import { NextRequest, NextResponse } from "next/server";
import {
  recordCareProgressQuerySchema,
  recordCareProgressResponseSchema,
} from "@/api-contract/recordCareQueue";
import { recordCareQueueService } from "@/server/services/recordCareQueueService";

export async function GET(request: NextRequest) {
  try {
    const query = recordCareProgressQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!query.success)
      return NextResponse.json(
        { error: "Invalid record care query", details: query.error.flatten() },
        { status: 400 },
      );
    const result = await recordCareQueueService.progress(query.data);
    return NextResponse.json(recordCareProgressResponseSchema.parse(result));
  } catch (error) {
    console.error("Error getting record care progress:", error);
    return NextResponse.json({ error: "Failed to get record care progress" }, { status: 500 });
  }
}
