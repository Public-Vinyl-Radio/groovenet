import { NextRequest, NextResponse } from "next/server";
import {
  recordActionListQuerySchema,
  recordActionListResponseSchema,
  recordCopyParamsSchema,
} from "@/api-contract/schemas";
import { recordCareService } from "@/server/services/recordCareService";
import { errorMessage } from "../../recordCareErrorStatus";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const parsedParams = recordCopyParamsSchema.safeParse({ id: (await params).id });
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: "Invalid record copy id", details: parsedParams.error.flatten() },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const parsedQuery = recordActionListQuerySchema.safeParse({
      friend_id: url.searchParams.get("friend_id"),
      action_type: url.searchParams.get("action_type") ?? undefined,
      include_voided: url.searchParams.get("include_voided") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "Invalid record action query", details: parsedQuery.error.flatten() },
        { status: 400 }
      );
    }

    const items = await recordCareService.listActions({
      copy_id: parsedParams.data.id,
      ...parsedQuery.data,
    });
    if (!items) {
      return NextResponse.json({ error: "Record copy not found" }, { status: 404 });
    }
    return NextResponse.json(
      recordActionListResponseSchema.parse({
        items,
        limit: parsedQuery.data.limit,
        offset: parsedQuery.data.offset,
      })
    );
  } catch (error) {
    console.error("Error listing record actions:", error);
    return NextResponse.json(
      { error: errorMessage(error, "Failed to list record actions") },
      { status: 500 }
    );
  }
}
