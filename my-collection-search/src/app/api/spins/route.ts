import { NextRequest, NextResponse } from "next/server";
import {
  spinCreateBodySchema,
  spinCreateResponseSchema,
  spinListQuerySchema,
  spinListResponseSchema,
} from "@/api-contract/schemas";
import {
  spinLoggingService,
  type CreateSpinSessionInput,
} from "@/server/services/spinLoggingService";
import { getSpinErrorStatus } from "./spinErrorStatus";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const parsedQuery = spinListQuerySchema.safeParse({
      friend_id: url.searchParams.get("friend_id"),
      release_id: url.searchParams.get("release_id") ?? undefined,
      track_id: url.searchParams.get("track_id") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "Invalid spin list query", details: parsedQuery.error.flatten() },
        { status: 400 }
      );
    }

    const items = await spinLoggingService.listSpinSessions(parsedQuery.data);
    const response = spinListResponseSchema.parse({
      items,
      limit: parsedQuery.data.limit,
      offset: parsedQuery.data.offset,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error listing spin sessions:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list spin sessions" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsedBody = spinCreateBodySchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid spin payload", details: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    let serviceInput: CreateSpinSessionInput;

    if (Array.isArray(parsedBody.data.side_keys)) {
      serviceInput = {
        friend_id: parsedBody.data.friend_id,
        release_id: parsedBody.data.release_id,
        played_at: parsedBody.data.played_at,
        note: parsedBody.data.note,
        context_type: parsedBody.data.context_type,
        side_keys: parsedBody.data.side_keys,
      };
    } else if (Array.isArray(parsedBody.data.track_refs)) {
      serviceInput = {
        friend_id: parsedBody.data.friend_id,
        release_id: parsedBody.data.release_id,
        played_at: parsedBody.data.played_at,
        note: parsedBody.data.note,
        context_type: parsedBody.data.context_type,
        track_refs: parsedBody.data.track_refs,
      };
    } else {
      return NextResponse.json(
        { error: "Provide exactly one of side_keys or track_refs" },
        { status: 400 }
      );
    }

    const result = await spinLoggingService.createSpinSession(serviceInput);
    const response = spinCreateResponseSchema.parse({
      session: result.session,
      selections: result.selections,
      expanded_tracks: result.track_events,
      derived: result.derived,
    });

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create spin session";
    const status = getSpinErrorStatus(message);

    console.error("Error creating spin session:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
