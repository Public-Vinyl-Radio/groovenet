// A one-line reading of a Discogs import for the row or page that shows it:
// "Reading collection · 240 found", "Fetching 12 of 340". Since #1274 it reads
// the import job's structured state, not the text stream's lines, so a reload
// or a second device reads the same thing.

import type { DiscogsImport } from "@/services/internalApi/discogsImports";

export function librarySyncProgress(job: DiscogsImport | null): string {
  if (!job) return "Starting sync";
  if (job.status === "failed" || job.status === "interrupted") return "Sync failed";
  if (job.status === "queued") return "Queued";
  if (job.stalled) return "Resuming after a restart";
  if (job.phase === "ingesting") return "Saving to library";
  if (job.phase === "fetching" && job.total !== null && job.total > 0) {
    return `Fetching ${Math.min(job.fetched, job.total)} of ${job.total}`;
  }
  if (job.found > 0) return `Reading collection · ${job.found.toLocaleString()} found`;
  return "Starting sync";
}
