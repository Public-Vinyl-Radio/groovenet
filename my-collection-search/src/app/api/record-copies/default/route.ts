import { NextRequest, NextResponse } from "next/server";
import {
  recordCopyDefaultUpdateBodySchema,
  recordCopyResponseSchema,
} from "@/api-contract/schemas";
import { recordCareService } from "@/server/services/recordCareService";
import { errorMessage, getRecordCareErrorStatus } from "../recordCareErrorStatus";

/**
 * Label or annotate a release's default copy, by release rather than by id —
 * the default may still be implicit, with no id yet. Makes it real if so.
 */
export async function PATCH(request: NextRequest) {
  try {
    const parsedBody = recordCopyDefaultUpdateBodySchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid record copy update", details: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const { friend_id, release_id, ...changes } = parsedBody.data;
    const copy = await recordCareService.updateDefaultCopy(friend_id, release_id, changes);
    return NextResponse.json(recordCopyResponseSchema.parse({ copy }));
  } catch (error) {
    const message = errorMessage(error, "Failed to update default record copy");
    console.error("Error updating default record copy:", error);
    return NextResponse.json({ error: message }, { status: getRecordCareErrorStatus(message) });
  }
}
