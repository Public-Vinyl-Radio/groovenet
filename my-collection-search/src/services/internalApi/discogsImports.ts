import type {
  DiscogsImportCreateResponse,
  DiscogsImportListResponse,
  DiscogsImportLogResponse,
} from "@groovenet/contracts";
import { http } from "../http";

export type { DiscogsImport } from "@groovenet/contracts";

/**
 * Queue a Discogs import (#1274); `username` undefined imports the server's
 * own account (`DISCOGS_USERNAME`). Returns the import already running for
 * that username instead of starting a second.
 */
export function startDiscogsImport(username?: string) {
  return http<DiscogsImportCreateResponse>("/api/discogs/imports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(username ? { username } : {}),
  });
}

/** The latest import per username. */
export function listDiscogsImports() {
  return http<DiscogsImportListResponse>("/api/discogs/imports", { cache: "no-store" });
}

export function getDiscogsImportLog(id: number, after = 0) {
  return http<DiscogsImportLogResponse>(`/api/discogs/imports/${id}/log?after=${after}`, {
    cache: "no-store",
  });
}
