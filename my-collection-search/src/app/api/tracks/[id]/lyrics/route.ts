import { NextRequest, NextResponse } from "next/server";
import {
  trackLyricsDeleteResponseSchema,
  trackLyricsSchema,
  trackLyricsUpdateRequestSchema,
} from "@groovenet/contracts";
import { trackLyricsService, type LyricsResult } from "@/server/services/trackLyricsService";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** The track id and `friend_id` query param, or the 400 to send. */
async function target(
  request: NextRequest,
  { params }: Params,
): Promise<{ trackId: string; friendId: number } | NextResponse> {
  const trackId = (await params).id;
  const friendIdRaw = request.nextUrl.searchParams.get("friend_id")?.trim();
  const friendId = Number(friendIdRaw);
  if (!trackId || !friendIdRaw || !Number.isInteger(friendId)) {
    return NextResponse.json(
      { error: "Missing required parameters: track_id and friend_id" },
      { status: 400 },
    );
  }
  return { trackId, friendId };
}

/** 404 for an unknown track, 403 for a friend's: lyrics are kept for your own library only. */
function denied(access: Exclude<LyricsResult<unknown>["access"], "owner">): NextResponse {
  if (access === "not_found") {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }
  return NextResponse.json({ error: "Lyrics are kept for your own library only" }, { status: 403 });
}

function failed(action: string, error: unknown): NextResponse {
  console.error(`Error ${action} track lyrics:`, error);
  return NextResponse.json({ error: `Failed to ${action} lyrics` }, { status: 500 });
}

/** A track's lyrics (#1171), owner only. 404 when it has none, as an instrumental does. */
export async function GET(request: NextRequest, context: Params) {
  try {
    const t = await target(request, context);
    if (t instanceof NextResponse) return t;
    const result = await trackLyricsService.get(t.trackId, t.friendId);
    if (result.access !== "owner") return denied(result.access);
    if (!result.value) {
      return NextResponse.json({ error: "No lyrics for this track" }, { status: 404 });
    }
    return NextResponse.json(trackLyricsSchema.parse(result.value));
  } catch (error) {
    return failed("read", error);
  }
}

/**
 * Store lyrics a person typed, as `source = 'user'`: an embedded re-read
 * (`gn files tags --force`) never overwrites them.
 */
export async function PUT(request: NextRequest, context: Params) {
  try {
    const t = await target(request, context);
    if (t instanceof NextResponse) return t;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = trackLyricsUpdateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((issue) => issue.message).join("; ") },
        { status: 400 },
      );
    }
    const result = await trackLyricsService.save(t.trackId, t.friendId, parsed.data.text);
    if (result.access !== "owner") return denied(result.access);
    return NextResponse.json(trackLyricsSchema.parse(result.value));
  } catch (error) {
    return failed("save", error);
  }
}

/**
 * Clear a track's lyrics by deleting the row, whatever wrote it, so the next
 * tag read can fill it from the file again.
 */
export async function DELETE(request: NextRequest, context: Params) {
  try {
    const t = await target(request, context);
    if (t instanceof NextResponse) return t;
    const result = await trackLyricsService.clear(t.trackId, t.friendId);
    if (result.access !== "owner") return denied(result.access);
    return NextResponse.json(trackLyricsDeleteResponseSchema.parse({ deleted: result.value }));
  } catch (error) {
    return failed("clear", error);
  }
}
