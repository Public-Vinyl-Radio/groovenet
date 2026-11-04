import { NextRequest, NextResponse } from "next/server";
import { trackPlaylistCountRefSchema } from "@/api-contract/schemas";
import { trackRepository } from "@/server/repositories/trackRepository";

// POST: { track_refs: { track_id: string; friend_id: number }[] }
//
// Deliberately lenient (#596): this is a bulk lookup the UI fires for whatever
// rows are on screen, so one malformed ref (a track still loading, a missing
// friend) must not fail the rest. Each ref is checked on its own against the
// shared schema and the bad ones are dropped. A body with no usable refs, or
// no `track_refs` array at all, is `{}` with a 200, never a 400.
export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    const rawRefs = (body as { track_refs?: unknown } | null)?.track_refs;
    if (!Array.isArray(rawRefs)) {
      return NextResponse.json({}, { status: 200 });
    }

    const refs = rawRefs.flatMap((ref) => {
      const parsed = trackPlaylistCountRefSchema.safeParse(ref);
      return parsed.success ? [parsed.data] : [];
    });
    if (refs.length === 0) {
      return NextResponse.json({}, { status: 200 });
    }

    // Returns: { ["track_id:friend_id"]: count }
    const counts = await trackRepository.getPlaylistCountsForTracks(refs);
    return NextResponse.json(counts);
  } catch (e) {
    console.error("Error getting playlist counts:", e);
    return NextResponse.json({ error: "Failed to get playlist counts" }, { status: 500 });
  }
}
