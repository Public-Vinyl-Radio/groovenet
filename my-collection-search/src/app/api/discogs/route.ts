// The Discogs import as a text stream: what `curl -N /api/discogs` and the
// clean-install test read. Since #1274 the import is a background job
// (`POST /api/discogs/imports`); this route queues one, or joins the one
// already running for that username, and streams its log until it ends.
// Leaving stops only the stream: the import carries on.

import { isDiscogsImportActive } from "@groovenet/contracts";
import { NextRequest } from "next/server";
import { RATE_LIMIT_POLICIES, withRateLimit } from "@/server/security/rateLimit";
import {
  DiscogsCredentialsMissingError,
  discogsImportService,
  MISSING_CREDENTIALS,
} from "@/server/services/discogsImportService";

/** How often the stream reads the job's log. */
export const STREAM_POLL_MS = 1000;
const PAGE_SIZE = 500;

async function handleGet(request: NextRequest) {
  const username = new URL(request.url).searchParams.get("username");
  let importId: number;
  try {
    importId = (await discogsImportService.start(username)).import.id;
  } catch (error) {
    const missing = error instanceof DiscogsCredentialsMissingError;
    if (!missing) console.error("[Discogs Sync] Could not start the import:", error);
    return new Response(
      JSON.stringify({
        error: missing
          ? MISSING_CREDENTIALS
          : error instanceof Error
            ? error.message
            : String(error),
      }),
      { status: 500 },
    );
  }

  const encoder = new TextEncoder();
  let open = true;
  const stream = new ReadableStream({
    async start(controller) {
      const write = (text: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          open = false;
        }
      };
      let after = 0;
      try {
        while (open) {
          // Read the state first: a job that has ended has written its last line.
          const job = await discogsImportService.get(importId);
          for (;;) {
            const page = await discogsImportService.readLog(importId, after, PAGE_SIZE);
            for (const { line } of page.lines) write(line);
            after = page.next_after;
            if (page.lines.length < PAGE_SIZE) break;
          }
          if (!open || !job || !isDiscogsImportActive(job.status)) break;
          await new Promise((resolve) => setTimeout(resolve, STREAM_POLL_MS));
        }
      } catch (error) {
        write(`Error: ${error instanceof Error ? error.message : String(error)}\n\n`);
      } finally {
        open = false;
        try {
          controller.close();
        } catch {
          // Cancelled by the client: nothing left to close.
        }
      }
    },
    cancel() {
      open = false;
      console.log(`[Discogs Sync] Client disconnected; import ${importId} continues`);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export const GET = withRateLimit(RATE_LIMIT_POLICIES.discogsImport, handleGet);
