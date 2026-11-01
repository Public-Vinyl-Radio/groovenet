import { NextRequest, NextResponse } from "next/server";
import {
  recordCareSessionParamsSchema,
  recordCareStackDiscardResponseSchema,
  recordCareStackResponseSchema,
  recordFriendQuerySchema,
} from "@/api-contract/schemas";
import { analytics } from "@/lib/analytics/server";
import { recordCareSessionService } from "@/server/services/recordCareSessionService";
import { errorMessage, getRecordCareSessionErrorStatus } from "../../recordCareSessionErrorStatus";

type RouteContext = { params: Promise<{ id: string }> };

type Parsed = { ok: true; id: number; friendId: number } | { ok: false; response: NextResponse };

async function parseRequest(request: NextRequest, { params }: RouteContext): Promise<Parsed> {
  const parsedParams = recordCareSessionParamsSchema.safeParse({ id: (await params).id });
  if (!parsedParams.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid stack id", details: parsedParams.error.flatten() },
        { status: 400 },
      ),
    };
  }
  const parsedQuery = recordFriendQuerySchema.safeParse({
    friend_id: new URL(request.url).searchParams.get("friend_id"),
  });
  if (!parsedQuery.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid stack query", details: parsedQuery.error.flatten() },
        { status: 400 },
      ),
    };
  }
  return { ok: true, id: parsedParams.data.id, friendId: parsedQuery.data.friend_id };
}

const notFound = () => NextResponse.json({ error: "Care stack not found" }, { status: 404 });

/** A stack with its copies in order, so the web app and CLI can reload it. */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const parsed = await parseRequest(request, context);
    if (!parsed.ok) return parsed.response;

    const stack = await recordCareSessionService.getStack(parsed.id, parsed.friendId);
    if (!stack) return notFound();
    return NextResponse.json(recordCareStackResponseSchema.parse({ stack }));
  } catch (error) {
    console.error("Error reading a care stack:", error);
    return NextResponse.json(
      { error: errorMessage(error, "Failed to read the stack") },
      { status: 500 },
    );
  }
}

/** Clear an open stack (CLEAR). Nothing was logged, so nothing is voided. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const parsed = await parseRequest(request, context);
    if (!parsed.ok) return parsed.response;

    const stack = await recordCareSessionService.discardStack(parsed.id, parsed.friendId);
    if (!stack) return notFound();
    analytics.track(
      "record_care_stack_discarded",
      { session_id: stack.id, stack_no: stack.stack_no },
      { request },
    );
    return NextResponse.json(recordCareStackDiscardResponseSchema.parse({ success: true, stack }));
  } catch (error) {
    const message = errorMessage(error, "Failed to clear the stack");
    console.error("Error clearing a care stack:", error);
    return NextResponse.json(
      { error: message },
      { status: getRecordCareSessionErrorStatus(message) },
    );
  }
}
