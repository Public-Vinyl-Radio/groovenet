import { NextRequest, NextResponse } from "next/server";
import {
  recordCopyCreateBodySchema,
  recordCopyListQuerySchema,
  recordCopyListResponseSchema,
  recordCopyResponseSchema,
} from "@/api-contract/schemas";
import { analytics } from "@/lib/analytics/server";
import { recordCareService } from "@/server/services/recordCareService";
import { defaultOverdueDays } from "@/lib/recordCare";
import { errorMessage, getRecordCareErrorStatus } from "./recordCareErrorStatus";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const parsedQuery = recordCopyListQuerySchema.safeParse({
      friend_id: url.searchParams.get("friend_id"),
      release_id: url.searchParams.get("release_id") ?? undefined,
    });
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "Invalid record copy query", details: parsedQuery.error.flatten() },
        { status: 400 }
      );
    }

    const items = await recordCareService.listCopies(
      parsedQuery.data.friend_id,
      parsedQuery.data.release_id
    );
    return NextResponse.json(recordCopyListResponseSchema.parse({ items, overdue_days: defaultOverdueDays() }));
  } catch (error) {
    console.error("Error listing record copies:", error);
    return NextResponse.json(
      { error: errorMessage(error, "Failed to list record copies") },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsedBody = recordCopyCreateBodySchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid record copy payload", details: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const copy = await recordCareService.createCopy(parsedBody.data);
    analytics.track(
      "record_copy_added",
      { copy_id: copy.id, release_id: copy.release_id, friend_id: copy.friend_id },
      { request }
    );
    return NextResponse.json(recordCopyResponseSchema.parse({ copy }), { status: 201 });
  } catch (error) {
    const message = errorMessage(error, "Failed to create record copy");
    console.error("Error creating record copy:", error);
    return NextResponse.json({ error: message }, { status: getRecordCareErrorStatus(message) });
  }
}
