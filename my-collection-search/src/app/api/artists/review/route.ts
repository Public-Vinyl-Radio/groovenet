import { NextRequest, NextResponse } from "next/server";
import {
  artistReviewBodySchema,
  artistReviewListSchema,
  artistReviewQuerySchema,
  artistReviewResultSchema,
} from "@/api-contract/artistReview";
import {
  artistReviewRepository,
  ArtistReviewError,
} from "@/server/repositories/artistReviewRepository";
import { artistReviewEvidence } from "@/server/services/artistReviewEvidence";

function failure(error: unknown) {
  if (error instanceof ArtistReviewError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("Artist review failed", error);
  return NextResponse.json({ error: "Artist review failed" }, { status: 500 });
}
export async function GET(request: NextRequest) {
  const query = artistReviewQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) return NextResponse.json({ error: "Invalid review query" }, { status: 400 });
  try {
    const result = await artistReviewRepository.list(query.data);
    // File evidence is on-demand, keeping queue pagination cheap.
    if (query.data.artist_id) for (const item of result.items) await artistReviewEvidence(item);
    return NextResponse.json(artistReviewListSchema.parse(result));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = artistReviewBodySchema.safeParse(raw);
  if (!body.success)
    return NextResponse.json({ error: "Invalid review decision" }, { status: 400 });
  try {
    return NextResponse.json(
      artistReviewResultSchema.parse(
        await artistReviewRepository.decide(body.data.decision, body.data.dry_run),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
