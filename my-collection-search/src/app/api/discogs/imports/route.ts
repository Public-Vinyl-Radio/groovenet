import {
  discogsImportCreateSchema,
  type DiscogsImportCreateResponse,
  type DiscogsImportListResponse,
} from "@groovenet/contracts";
import { NextResponse } from "next/server";
import { RATE_LIMIT_POLICIES, withRateLimit } from "@/server/security/rateLimit";
import {
  DiscogsCredentialsMissingError,
  discogsImportService,
} from "@/server/services/discogsImportService";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The latest import per username, or only the active ones with `?active=1` (#1274). */
export async function GET(request: Request) {
  try {
    const active = new URL(request.url).searchParams.get("active");
    const imports = await discogsImportService.list(active === "1" || active === "true");
    return NextResponse.json({ imports } satisfies DiscogsImportListResponse);
  } catch (error) {
    console.error("[Discogs Import] List failed:", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

/**
 * Queue an import of one library (`username`, else `DISCOGS_USERNAME`).
 * 201 with the new import, or 200 with the one already active for that
 * username: never a second one.
 */
async function handlePost(request: Request) {
  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = discogsImportCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      {
        status: 400,
      },
    );
  }
  try {
    const result = await discogsImportService.start(parsed.data.username);
    return NextResponse.json(result satisfies DiscogsImportCreateResponse, {
      status: result.created ? 201 : 200,
    });
  } catch (error) {
    if (error instanceof DiscogsCredentialsMissingError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    console.error("[Discogs Import] Start failed:", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export const POST = withRateLimit(RATE_LIMIT_POLICIES.discogsImport, handlePost);
