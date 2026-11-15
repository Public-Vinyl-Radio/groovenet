import { NextRequest, NextResponse } from "next/server";
import {
  MAX_RANKING_FILE_BYTES,
  parseRankingProfileFile,
  RankingImportError,
  rankingProfileImportSchema,
  rankingProfileImportResponseSchema,
} from "@groovenet/contracts";
import { analytics } from "@/lib/analytics/server";
import { rankingProfileService } from "@/server/services/rankingProfileService";
import { failure, invalid } from "../../respond";

/** Read a bounded stream, before JSON parsing; Content-Length alone is untrusted. */
export async function readRankingImportBody(request: Request): Promise<unknown> {
  const cap = MAX_RANKING_FILE_BYTES * 2 + 1024; // escaped file JSON plus envelope
  if (Number(request.headers.get("content-length")) > cap)
    throw new RankingImportError(`Body exceeds ${cap} bytes`);
  if (!request.body) throw new RankingImportError("Missing JSON body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > cap) {
        await reader.cancel();
        throw new RankingImportError(`Body exceeds ${cap} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new RankingImportError("Invalid JSON body");
  }
}

export async function POST(request: NextRequest) {
  let parsed;
  let body;
  try {
    const result = rankingProfileImportSchema.safeParse(await readRankingImportBody(request));
    if (!result.success) return invalid(result.error.message);
    body = result.data;
    parsed = parseRankingProfileFile(body.file);
  } catch (error) {
    return invalid(error instanceof Error ? error.message : "Invalid ranking file");
  }
  try {
    const { format: _format, ...draft } = parsed.file;
    void _format;
    const profile = await rankingProfileService.create(body.friend_id, draft, "file");
    analytics.track(
      "ranking_profile_imported",
      { profile: "custom", warning_count: parsed.warnings.length },
      { request },
    );
    return NextResponse.json(
      rankingProfileImportResponseSchema.parse({ profile, warnings: parsed.warnings }),
      { status: 201 },
    );
  } catch (error) {
    return failure(error, "Failed to import ranking profile");
  }
}
