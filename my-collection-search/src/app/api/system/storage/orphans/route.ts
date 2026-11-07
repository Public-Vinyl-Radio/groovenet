import { NextResponse } from "next/server";
import { orphansQuerySchema, orphansResponseSchema } from "@groovenet/contracts";
import { getOrphans } from "@/server/services/storageOrphanService";

export const dynamic = "force-dynamic";

/** The latest orphan scan (#1052), paged. Never rescans. */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = orphansQuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(orphansResponseSchema.parse(await getOrphans(parsed.data)));
  } catch (error) {
    console.error("[storage] GET orphans error:", error);
    return NextResponse.json({ error: "Failed to read the orphan scan" }, { status: 500 });
  }
}
