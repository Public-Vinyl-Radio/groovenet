import { NextResponse } from "next/server";
import { trackRepository } from "@/server/repositories/trackRepository";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      tracks: Array<{ track_id: string; friend_id: number; position?: number }>;
    };
    const tracks = Array.isArray(body?.tracks) ? body.tracks : [];
    if (tracks.length === 0) {
      return NextResponse.json([], { status: 200 });
    }

    // Build a VALUES table of (track_id, friend_id, ord) to preserve order
    const rows = await trackRepository.findTracksByRefsPreservingOrder(tracks);

    const ordered = rows.map((t) => {
      const rest = { ...t } as Record<string, unknown>;
      delete rest.ord;
      return rest;
    });
    return NextResponse.json(ordered);
  } catch (error) {
    console.error("Error fetching tracks by ids:", error);
    return NextResponse.json(
      { error: "Failed to fetch tracks" },
      { status: 500 }
    );
  }
}
