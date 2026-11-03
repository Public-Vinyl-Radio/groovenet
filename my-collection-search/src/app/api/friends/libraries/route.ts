import { NextResponse } from "next/server";
import { librariesListResponseSchema } from "@/api-contract/schemas";
import { friendService } from "@/server/services/friendService";

/** Settings → Libraries: every library with its album count, last sync and which is your account. */
export async function GET() {
  try {
    return NextResponse.json(
      librariesListResponseSchema.parse(await friendService.listLibraries()),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
