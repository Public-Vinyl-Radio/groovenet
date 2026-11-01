import { NextRequest, NextResponse } from "next/server";
import {
  recordCareStackListQuerySchema,
  recordCareStackListResponseSchema,
  recordCareStackPullBodySchema,
  recordCareStackPullResponseSchema,
} from "@/api-contract/schemas";
import { analytics } from "@/lib/analytics/server";
import { recordCareSessionService } from "@/server/services/recordCareSessionService";
import { errorMessage, getRecordCareSessionErrorStatus } from "../recordCareSessionErrorStatus";

/**
 * Pull the next stack of copies to care for. With a stack already open,
 * returns that one instead (200, `created: false`).
 */
export async function POST(request: NextRequest) {
  try {
    const parsedBody = recordCareStackPullBodySchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid stack payload", details: parsedBody.error.flatten() },
        { status: 400 },
      );
    }

    const result = await recordCareSessionService.pullStack(parsedBody.data);
    analytics.track(
      "record_care_stack_pulled",
      {
        session_id: result.stack.id,
        stack_no: result.stack.stack_no,
        record_count: result.stack.items.length,
        created: result.created,
      },
      { request },
    );
    return NextResponse.json(recordCareStackPullResponseSchema.parse(result), {
      status: result.created ? 201 : 200,
    });
  } catch (error) {
    const message = errorMessage(error, "Failed to pull a stack");
    console.error("Error pulling a care stack:", error);
    return NextResponse.json(
      { error: message },
      { status: getRecordCareSessionErrorStatus(message) },
    );
  }
}

/** The friend's stacks, newest first; `status=open` for the one in progress. */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const parsedQuery = recordCareStackListQuerySchema.safeParse({
      friend_id: url.searchParams.get("friend_id"),
      status: url.searchParams.get("status") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "Invalid stack query", details: parsedQuery.error.flatten() },
        { status: 400 },
      );
    }

    const items = await recordCareSessionService.listStacks(parsedQuery.data);
    return NextResponse.json(
      recordCareStackListResponseSchema.parse({
        items,
        limit: parsedQuery.data.limit,
        offset: parsedQuery.data.offset,
      }),
    );
  } catch (error) {
    console.error("Error listing care stacks:", error);
    return NextResponse.json(
      { error: errorMessage(error, "Failed to list stacks") },
      { status: 500 },
    );
  }
}
