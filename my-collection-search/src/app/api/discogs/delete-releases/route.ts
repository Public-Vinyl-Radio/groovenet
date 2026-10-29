import { NextRequest, NextResponse } from "next/server";
import {
  deleteRelease,
  getManifestPath,
  getManifestReleaseIds,
  saveManifest,
  parseManifestFile,
  getManifestFiles,
} from "@/server/services/discogsManifestService";
import { cleanupDiscogsReleases } from "@/server/services/discogsCleanupService";

interface DeleteReleasesRequest {
  username: string;
  releaseIds: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body: DeleteReleasesRequest = await request.json();
    const { username, releaseIds } = body;

    if (!username || !Array.isArray(releaseIds)) {
      return NextResponse.json(
        { error: "username and releaseIds array required" },
        { status: 400 },
      );
    }

    const deletedFiles: string[] = [];
    const failedDeletes: string[] = [];
    // Step 1: Delete local JSON files
    for (const releaseId of releaseIds) {
      const success = deleteRelease(username, releaseId);
      if (success) {
        deletedFiles.push(releaseId);
      } else {
        failedDeletes.push(releaseId);
      }
    }

    // Step 2: Update manifest - move to deletedReleaseIds
    const manifestPath = getManifestPath(username);
    const currentIds = getManifestReleaseIds(username);
    const remainingIds = currentIds.filter((id) => !releaseIds.includes(id));

    // Read existing deleted IDs
    let existingDeletedIds: string[] = [];
    try {
      const manifestFiles = getManifestFiles();
      const manifestFile = manifestFiles.find((f) => {
        const { username: u } = parseManifestFile(f);
        return u === username;
      });
      if (manifestFile) {
        const { manifest } = parseManifestFile(manifestFile);
        existingDeletedIds = manifest.deletedReleaseIds || [];
      }
    } catch {
      // ignore
    }

    const allDeletedIds = [...existingDeletedIds, ...releaseIds];
    saveManifest(manifestPath, remainingIds, allDeletedIds);

    // Step 3: Delete from PostgreSQL
    const cleanup = await cleanupDiscogsReleases(username, releaseIds);

    return NextResponse.json({
      message: `Deleted ${releaseIds.length} releases`,
      deletedFiles,
      failedDeletes,
      deletedTrackIds: cleanup.deletedTrackIds,
      deletedFromDb: cleanup.deletedTracksCount,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[Delete Releases Error]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
