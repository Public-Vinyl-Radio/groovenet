import { NextRequest, NextResponse } from "next/server";
import {
  recordCopyDeleteResponseSchema,
  recordCopyParamsSchema,
  recordCopyResponseSchema,
  recordCopyUpdateBodySchema,
  recordFriendQuerySchema,
} from "@/api-contract/schemas";
import { analytics } from "@/lib/analytics/server";
import { recordCareService } from "@/server/services/recordCareService";
import { changedCopyFields } from "../changedCopyFields";
import { errorMessage, getRecordCareErrorStatus } from "../recordCareErrorStatus";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const parsedParams = recordCopyParamsSchema.safeParse({ id: (await params).id });
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: "Invalid record copy id", details: parsedParams.error.flatten() },
        { status: 400 }
      );
    }

    const parsedBody = recordCopyUpdateBodySchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid record copy update", details: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const { friend_id, ...changes } = parsedBody.data;
    const copy = await recordCareService.updateCopy(parsedParams.data.id, friend_id, changes);
    if (!copy) {
      return NextResponse.json({ error: "Record copy not found" }, { status: 404 });
    }
    analytics.track(
      "record_copy_edited",
      {
        copy_id: copy.id,
        release_id: copy.release_id,
        is_default: copy.is_default,
        changed_fields: changedCopyFields(changes),
      },
      { request }
    );
    return NextResponse.json(recordCopyResponseSchema.parse({ copy }));
  } catch (error) {
    const message = errorMessage(error, "Failed to update record copy");
    console.error("Error updating record copy:", error);
    return NextResponse.json({ error: message }, { status: getRecordCareErrorStatus(message) });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const parsedParams = recordCopyParamsSchema.safeParse({ id: (await params).id });
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: "Invalid record copy id", details: parsedParams.error.flatten() },
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

    const copy = await recordCareService.deleteCopy(
      parsedParams.data.id,
      parsedQuery.data.friend_id
    );
    if (!copy) {
      return NextResponse.json({ error: "Record copy not found" }, { status: 404 });
    }
    analytics.track(
      "record_copy_removed",
      { copy_id: copy.id, release_id: copy.release_id },
      { request }
    );
    return NextResponse.json(recordCopyDeleteResponseSchema.parse({ success: true, copy }));
  } catch (error) {
    const message = errorMessage(error, "Failed to delete record copy");
    console.error("Error deleting record copy:", error);
    return NextResponse.json({ error: message }, { status: getRecordCareErrorStatus(message) });
  }
}
