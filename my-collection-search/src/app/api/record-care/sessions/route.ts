import { NextRequest, NextResponse } from "next/server";
import {
  recordCareLogQuerySchema,
  recordCareLogResponseSchema,
  recordCareSessionCreateBodySchema,
  recordCareSessionMutationResponseSchema,
} from "@/api-contract/schemas";
import { analytics } from "@/lib/analytics/server";
import { recordCareSessionService } from "@/server/services/recordCareSessionService";
import { errorMessage, getRecordCareSessionErrorStatus } from "../recordCareSessionErrorStatus";

/**
 * Batch log: one action per copy per type for an open stack or an ad-hoc
 * selection, in one transaction.
 */
export async function POST(request: NextRequest) {
  try {
    const parsedBody = recordCareSessionCreateBodySchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid care session payload", details: parsedBody.error.flatten() },
        { status: 400 },
      );
    }

    const result = await recordCareSessionService.logSession(parsedBody.data);
    analytics.track(
      "record_care_session_logged",
      {
        session_id: result.session.id,
        stack_no: result.session.stack_no,
        action_types: parsedBody.data.action_types,
        record_count: result.copies.length,
        sleeve_type: parsedBody.data.sleeve_type ?? null,
        method: parsedBody.data.details?.method ?? null,
      },
      { request },
    );
    return NextResponse.json(recordCareSessionMutationResponseSchema.parse(result), {
      status: 201,
    });
  } catch (error) {
    const message = errorMessage(error, "Failed to log care");
    console.error("Error logging a care session:", error);
    return NextResponse.json(
      { error: message },
      { status: getRecordCareSessionErrorStatus(message) },
    );
  }
}

/** The care log feed, newest first. */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const parsedQuery = recordCareLogQuerySchema.safeParse({
      friend_id: url.searchParams.get("friend_id"),
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "Invalid care log query", details: parsedQuery.error.flatten() },
        { status: 400 },
      );
    }

    const result = await recordCareSessionService.listLog(parsedQuery.data);
    return NextResponse.json(
      recordCareLogResponseSchema.parse({
        ...result,
        limit: parsedQuery.data.limit,
        offset: parsedQuery.data.offset,
      }),
    );
  } catch (error) {
    console.error("Error listing the care log:", error);
    return NextResponse.json(
      { error: errorMessage(error, "Failed to list the care log") },
      { status: 500 },
    );
  }
}
