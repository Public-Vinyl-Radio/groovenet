import { NextRequest, NextResponse } from "next/server";
import {
  recordActionParamsSchema,
  recordActionVoidResponseSchema,
  recordFriendQuerySchema,
} from "@/api-contract/schemas";
import { analytics } from "@/lib/analytics/server";
import { recordCareService } from "@/server/services/recordCareService";
import { errorMessage } from "../../record-copies/recordCareErrorStatus";

/** Void an action. It stays in the history; it stops counting toward care state. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const parsedParams = recordActionParamsSchema.safeParse({ id: (await params).id });
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: "Invalid record action id", details: parsedParams.error.flatten() },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const parsedQuery = recordFriendQuerySchema.safeParse({
      friend_id: url.searchParams.get("friend_id"),
    });
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "Invalid delete query", details: parsedQuery.error.flatten() },
        { status: 400 }
      );
    }

    const result = await recordCareService.voidAction(
      parsedParams.data.id,
      parsedQuery.data.friend_id
    );
    if (!result) {
      return NextResponse.json({ error: "Record action not found" }, { status: 404 });
    }
    analytics.track(
      "record_action_voided",
      {
        action_id: result.action.id,
        copy_id: result.action.copy_id,
        action_type: result.action.action_type,
      },
      { request }
    );
    return NextResponse.json(recordActionVoidResponseSchema.parse({ success: true, ...result }));
  } catch (error) {
    console.error("Error voiding record action:", error);
    return NextResponse.json(
      { error: errorMessage(error, "Failed to void record action") },
      { status: 500 }
    );
  }
}
