import { NextResponse } from "next/server";
import {
  playlistDetailParamsSchema,
  playlistSpinsBodySchema,
  playlistSpinsResponseSchema,
} from "@/api-contract/schemas";
import { playlistSpinService } from "@/server/services/playlistSpinService";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsedParams = playlistDetailParamsSchema.safeParse({ id });
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid playlist id" }, { status: 400 });
    }
    const parsedBody = playlistSpinsBodySchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid playlist spin payload", details: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const result = await playlistSpinService.log(parsedParams.data.id, parsedBody.data);
    return NextResponse.json(playlistSpinsResponseSchema.parse(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to log playlist spins";
    const status = message === "Playlist not found" || message === "Performance not found for playlist"
      ? 404
      : message.startsWith("Playlist has no performance") ||
          message.startsWith("Set derivation") ||
          message.startsWith("Playlist changed") ||
          message.startsWith("Playlist track")
        ? 400
        : 500;
    console.error("Error logging playlist spins:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
