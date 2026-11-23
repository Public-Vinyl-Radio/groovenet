"use client";

import { useSyncDiscogs } from "@/hooks/useDiscogsQuery";
import { writeFirstImportFlag } from "@/lib/firstImport";
import { librarySyncProgress } from "@/components/settings/librarySyncProgress";
import { useSyncStreams } from "@/providers/SyncStreamsProvider";

// A line the sync stream writes when it gives up (the route reports errors in-stream).
const FAILED_LINE = /^(Error: |❌)/;

/**
 * The reason a stream line reports a failure, or null. `streamLines` doesn't look at the HTTP
 * status, so a refused request (429 from the rate limit, 500 from missing credentials) arrives
 * as one `{"error": "..."}` line rather than a thrown error.
 */
function failureOfLine(raw: string): string | null {
  const line = raw.trim();
  if (FAILED_LINE.test(line)) return line;
  if (!line.startsWith("{")) return null;
  try {
    const body: unknown = JSON.parse(line);
    const message = (body as { error?: unknown } | null)?.error;
    return typeof message === "string" && message ? message : null;
  } catch {
    return null;
  }
}

/**
 * The Discogs sync as the empty states and the first-import guidance use it (#1246): the same
 * `useSyncDiscogs` and stream Settings → Libraries runs, minus its dialog. The stream's state
 * lives in a root provider, so `running` is still true when you come back to a page mid-import.
 */
export function useDiscogsImport() {
  const sync = useSyncDiscogs();
  const { discogs } = useSyncStreams();

  const started = discogs.lines.length > 0 || discogs.error !== null;
  const running = sync.isPending || (started && !discogs.done && discogs.error === null);
  const failure =
    !running && started
      ? (discogs.error ??
        discogs.lines.map(failureOfLine).find((reason) => reason !== null) ??
        null)
      : null;

  return {
    running,
    progress: running ? librarySyncProgress(discogs.lines, discogs.error) : null,
    failure,
    /** An import ran to its end without failing, yet the library is still empty. */
    finished: !running && started && failure === null && discogs.done,
    /** `username` undefined syncs the server's own account (`DISCOGS_USERNAME`). */
    start: (username?: string) => {
      writeFirstImportFlag("pending");
      sync.mutate({ username, showDialog: false });
    },
  };
}
