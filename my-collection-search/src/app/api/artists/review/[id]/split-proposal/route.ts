import { NextResponse } from "next/server";
import { artistSplitProposalSchema } from "@groovenet/contracts";
import {
  artistReviewRepository,
  ArtistReviewError,
} from "@/server/repositories/artistReviewRepository";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))
    return NextResponse.json({ error: "Invalid artist ID" }, { status: 400 });
  try {
    return NextResponse.json(
      artistSplitProposalSchema.parse(await artistReviewRepository.splitProposal(Number(id))),
    );
  } catch (error) {
    if (error instanceof ArtistReviewError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Artist split proposal failed", error);
    return NextResponse.json({ error: "Artist split proposal failed" }, { status: 500 });
  }
}
