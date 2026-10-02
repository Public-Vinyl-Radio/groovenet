import { NextRequest, NextResponse } from "next/server";
import {
  recordActionCreateBodySchema,
  recordActionMutationResponseSchema,
} from "@/api-contract/schemas";
import { analytics } from "@/lib/analytics/server";
import {
  recordCareService,
  type LogRecordActionInput,
} from "@/server/services/recordCareService";
import {
  errorMessage,
  getRecordCareErrorStatus,
} from "../record-copies/recordCareErrorStatus";

/**
 * Log a care action against a copy, or against a release — which lands on the
 * release's default copy, created if it has none.
 */
export async function POST(request: NextRequest) {
  try {
    const parsedBody = recordActionCreateBodySchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid record action payload", details: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    // The schema has already required exactly one of copy_id and release_id.
    const { copy_id, release_id, ...action } = parsedBody.data;
    const input: LogRecordActionInput =
      copy_id !== undefined ? { ...action, copy_id } : { ...action, release_id: release_id! };
    const result = await recordCareService.logAction(input);
    analytics.track(
      "record_action_logged",
      {
        action_id: result.action.id,
        copy_id: result.action.copy_id,
        action_type: result.action.action_type,
        sleeve_type: result.action.sleeve_type,
        method: result.action.details.method ?? null,
      },
      { request }
    );
    return NextResponse.json(recordActionMutationResponseSchema.parse(result), {
      status: 201,
    });
  } catch (error) {
    const message = errorMessage(error, "Failed to log record action");
    console.error("Error logging record action:", error);
    return NextResponse.json({ error: message }, { status: getRecordCareErrorStatus(message) });
  }
}
