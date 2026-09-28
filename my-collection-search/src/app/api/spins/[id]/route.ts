import { NextRequest, NextResponse } from "next/server";
import {
  spinDeleteQuerySchema,
  spinDeleteResponseSchema,
  spinSessionParamsSchema,
  spinUpdateBodySchema,
  spinUpdateResponseSchema,
} from "@/api-contract/schemas";
import { spinLoggingService } from "@/server/services/spinLoggingService";
import { getSpinErrorStatus } from "../spinErrorStatus";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const parsedParams = spinSessionParamsSchema.safeParse({ id: (await params).id });
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: "Invalid spin session id", details: parsedParams.error.flatten() },
        { status: 400 }
      );
    }

    const parsedBody = spinUpdateBodySchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid spin update", details: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const { friend_id, ...changes } = parsedBody.data;
    const updated = await spinLoggingService.updateSpinSession(
      parsedParams.data.id,
      friend_id,
      changes
    );
    if (!updated) {
      return NextResponse.json({ error: "Spin session not found" }, { status: 404 });
    }

    return NextResponse.json(spinUpdateResponseSchema.parse(updated));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update spin session";
    console.error("Error updating spin session:", error);
    return NextResponse.json({ error: message }, { status: getSpinErrorStatus(message) });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const url = new URL(request.url);
    const routeParams = await params;
    const parsedParams = spinSessionParamsSchema.safeParse({
      id: routeParams.id,
    });
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: "Invalid spin session id", details: parsedParams.error.flatten() },
        { status: 400 }
      );
    }

    const parsedQuery = spinDeleteQuerySchema.safeParse({
      friend_id: url.searchParams.get("friend_id"),
    });
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "Invalid delete query", details: parsedQuery.error.flatten() },
        { status: 400 }
      );
    }

    const deleted = await spinLoggingService.deleteSpinSession(
      parsedParams.data.id,
      parsedQuery.data.friend_id
    );

    if (!deleted) {
      return NextResponse.json({ error: "Spin session not found" }, { status: 404 });
    }

    return NextResponse.json(
      spinDeleteResponseSchema.parse({
        success: true,
        session: deleted,
      })
    );
  } catch (error) {
    console.error("Error deleting spin session:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete spin session" },
      { status: 500 }
    );
  }
}
