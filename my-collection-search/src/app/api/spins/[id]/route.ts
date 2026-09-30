import { NextRequest, NextResponse } from "next/server";
import {
  spinDeleteQuerySchema,
  spinDeleteResponseSchema,
  spinSessionParamsSchema,
  spinUpdateBodySchema,
  spinUpdateResponseSchema,
} from "@/api-contract/schemas";
import { analytics } from "@/lib/analytics/server";
import { spinLoggingService } from "@/server/services/spinLoggingService";
import { getSpinErrorStatus } from "../spinErrorStatus";

/** What an edit touched; a new selection counts once, whichever form it took. */
function changedSpinFields(changes: Record<string, unknown>): string[] {
  const fields = Object.keys(changes)
    .filter((key) => changes[key] !== undefined)
    .map((key) => (key === "side_keys" || key === "track_refs" ? "selection" : key));
  return [...new Set(fields)];
}

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

    analytics.track(
      "spin_edited",
      {
        spin_id: updated.session.id,
        was_detected: updated.session.provenance === "automatic",
        changed_fields: changedSpinFields(changes),
      },
      { request }
    );

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

    analytics.track(
      "spin_deleted",
      { spin_id: deleted.id, was_detected: deleted.provenance === "automatic" },
      { request }
    );

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
