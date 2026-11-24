"use client";

import { isDiscogsImportActive } from "@groovenet/contracts";
import { librarySyncProgress } from "@/components/settings/librarySyncProgress";
import {
  IDLE_POLL_MS,
  importFor,
  useDiscogsImportsQuery,
  useStartDiscogsImport,
} from "@/hooks/useDiscogsImports";
import { writeFirstImportFlag } from "@/lib/firstImport";

/**
 * The Discogs import as the empty states and the first-import guidance use it (#1246): the
 * same import job Settings → Libraries runs (#1274). It reads the job from the server, so an
 * import started on another page, before a reload or on another device shows as running, and
 * the action is never offered while it runs.
 *
 * `username` is the library the page imports into; null is the server's own account.
 */
export function useDiscogsImport(username: string | null) {
  const imports = useDiscogsImportsQuery({ idlePollMs: IDLE_POLL_MS });
  const start = useStartDiscogsImport();
  const job = importFor(imports.data?.imports, username);

  const jobRunning = job !== null && isDiscogsImportActive(job.status);
  const running = start.isPending || jobRunning;
  const jobFailed = job !== null && (job.status === "failed" || job.status === "interrupted");
  // A refused request (429 from the rate limit, 500 for missing credentials) is a failure too.
  const failure = running
    ? null
    : (start.error?.message ?? (jobFailed ? (job.last_error ?? "The import stopped") : null));

  return {
    running,
    progress: running ? librarySyncProgress(job) : null,
    failure,
    /** An import ran to its end without failing, yet the library is still empty. */
    finished: !running && failure === null && job?.status === "completed",
    /** `username` undefined imports the server's own account (`DISCOGS_USERNAME`). */
    start: (target?: string) => {
      writeFirstImportFlag("pending");
      start.mutate(target);
    },
  };
}
