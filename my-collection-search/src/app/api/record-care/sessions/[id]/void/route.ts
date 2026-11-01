import { NextRequest, NextResponse } from "next/server";
import {
  recordCareSessionParamsSchema,
  recordCareSessionVoidBodySchema,
  recordCareSessionVoidResponseSchema,
} from "@/api-contract/schemas";
import { analytics } from "@/lib/analytics/server";
import { recordCareSessionService } from "@/server/services/recordCareSessionService";
import {
  errorMessage,
  getRecordCareSessionErrorStatus,
} from "../../../recordCareSessionErrorStatus";

/**
 * Undo a log: void its actions (kept as history), recompute each copy's care
 * state and reopen the stack.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const parsedParams = recordCareSessionParamsSchema.safeParse({ id: (await params).id });
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: "Invalid care session id", details: parsedParams.error.flatten() },
        { status: 400 },
      );
    }
    const parsedBody = recordCareSessionVoidBodySchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid undo payload", details: parsedBody.error.flatten() },
        { status: 400 },
      );
    }

    const result = await recordCareSessionService.voidSession(
      parsedParams.data.id,
      parsedBody.data.friend_id,
    );
    if (!result) {
      return NextResponse.json({ error: "Care session not found" }, { status: 404 });
    }
    analytics.track(
      "record_care_session_voided",
      {
        session_id: result.session.id,
        stack_no: result.session.stack_no,
        action_count: result.actions.length,
      },
      { request },
    );
    return NextResponse.json(
      recordCareSessionVoidResponseSchema.parse({ success: true, ...result }),
    );
  } catch (error) {
    const message = errorMessage(error, "Failed to undo the log");
    console.error("Error undoing a care session:", error);
    return NextResponse.json(
      { error: message },
      { status: getRecordCareSessionErrorStatus(message) },
    );
  }
}
