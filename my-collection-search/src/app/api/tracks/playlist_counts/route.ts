import { NextRequest, NextResponse } from "next/server";
import { trackRepository } from "@/server/repositories/trackRepository";

// POST: { track_refs: { track_id: string; friend_id: number }[] }
export async function POST(req: NextRequest) {
  try {
    const { track_refs } = await req.json();
    if (!Array.isArray(track_refs) || track_refs.length === 0) {
      return NextResponse.json({}, { status: 200 });
    }

    const sanitized = track_refs
      .filter(
        (ref: unknown) =>
          !!ref &&
          typeof ref === "object" &&
          typeof (ref as { track_id?: unknown }).track_id === "string" &&
          typeof (ref as { friend_id?: unknown }).friend_id === "number",
      )
      .map((ref: { track_id: string; friend_id: number }) => ({
        track_id: ref.track_id,
        friend_id: ref.friend_id,
      }));

    if (sanitized.length === 0) {
      return NextResponse.json({}, { status: 200 });
    }

    // Returns: { ["track_id:friend_id"]: count }
    const counts = await trackRepository.getPlaylistCountsForTracks(sanitized);
    return NextResponse.json(counts);
  } catch (e) {
    console.error("Error getting playlist counts:", e);
    return NextResponse.json({ error: "Failed to get playlist counts" }, { status: 500 });
  }
}
