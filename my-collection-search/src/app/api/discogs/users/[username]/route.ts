import { NextResponse } from "next/server";
import { discogsUserLookupResponseSchema, discogsUsernameSchema } from "@/api-contract/schemas";
import { lookupDiscogsUser } from "@/server/services/discogsApiClient";

type Context = { params: Promise<{ username: string }> };

/**
 * Look up a Discogs user before adding their library: whether they exist and
 * how many releases their collection holds. On demand only (one Discogs
 * request per call), so nothing should poll it.
 */
export async function GET(_request: Request, { params }: Context) {
  const parsed = discogsUsernameSchema.safeParse((await params).username);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Discogs username" }, { status: 400 });
  }
  const username = parsed.data;
  if (!process.env.DISCOGS_USER_TOKEN) {
    return NextResponse.json(
      { error: "Discogs credentials not set in environment" },
      { status: 500 },
    );
  }
  try {
    const lookup = await lookupDiscogsUser(username);
    return NextResponse.json(
      discogsUserLookupResponseSchema.parse(
        lookup.found
          ? { username, found: true, release_count: lookup.releaseCount }
          : { username, found: false },
      ),
    );
  } catch (error) {
    return NextResponse.json(
      { error: `Discogs lookup failed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 502 },
    );
  }
}
