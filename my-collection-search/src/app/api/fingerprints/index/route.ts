import { NextResponse } from "next/server";
import {
  fingerprintIndexBodySchema,
  fingerprintIndexRunSchema,
} from "@/api-contract/schemas";
import {
  NoFingerprintEngineError,
  fingerprintIndexService,
} from "@/server/services/fingerprintIndexService";
import type { FingerprintIndexScope } from "@/types/fingerprint";

type IndexBody = ReturnType<typeof fingerprintIndexBodySchema.parse>;

function toScope(body: IndexBody): FingerprintIndexScope {
  switch (body.scope) {
    case "track":
      return {
        kind: "track",
        track_id: body.track_id as string,
        friend_id: body.friend_id,
      };
    case "release":
      return {
        kind: "release",
        release_id: body.release_id as string,
        friend_id: body.friend_id,
      };
    default:
      return { kind: body.scope };
  }
}

/**
 * Start a reference-library indexing run (#277).
 *
 * Resolves the scope to candidate tracks and queues one job per track for
 * `fingerprint-service`. Returns immediately with the run's totals — the work
 * itself is asynchronous, and progress is read back from
 * `/api/fingerprints/index/{runId}`.
 */
export async function POST(req: Request) {
  try {
    const parsed = fingerprintIndexBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid index request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const body = parsed.data;
    // `force` is orthogonal to scope: even `all` skips unchanged files by
    // default, so re-running any scope immediately regenerates nothing.
    const run = await fingerprintIndexService.startRun(toScope(body), {
      force: body.force === true,
    });

    return NextResponse.json(fingerprintIndexRunSchema.parse(run), { status: 202 });
  } catch (error) {
    if (error instanceof NoFingerprintEngineError) {
      // Not a server fault: there is simply nothing running that could index,
      // and guessing an engine identity would poison the table.
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error starting fingerprint index run:", err);
    return NextResponse.json(
      { error: err.message || "Failed to start indexing run" },
      { status: 500 }
    );
  }
}
